from __future__ import annotations

import json
import math
from typing import Any, Iterable, Iterator, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class StructuredOutputError(ValueError):
    def __init__(self, response: Any):
        super().__init__("Response did not match the output schema")
        self.response = response


def output_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    if "output" in response:
        return "".join(part.get("text", "") for item in response["output"] for part in item.get("content", []) if part.get("type") == "output_text")
    return next(iter(response.get("choices", [])), {}).get("message", {}).get("content", "") or ""


def parse_output(response: dict[str, Any], schema: type[T]) -> T:
    try:
        return schema.model_validate_json(output_text(response))
    except (ValueError, TypeError) as error:
        raise StructuredOutputError(response) from error


class StreamResponseError(ValueError):
    def __init__(self, event: dict[str, Any]):
        super().__init__("Generation stream ended with an error")
        self.event = event


def _accumulate_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    event_type = event.get("type")
    if event_type in ("error", "response.failed", "response.incomplete"):
        raise StreamResponseError(event)
    response = event.get("response")
    if event_type == "response.completed" and isinstance(response, dict):
        state["final_response"] = response
        if "output_text" in response or "output" in response:
            state["text"] = output_text(response)
    elif event_type != "response.output_text.done":
        state["text"] += event.get("text") or ""
    if event.get("usage") is not None:
        state["usage"] = event["usage"]
    state["last_event"] = event


def collect_stream(events: Iterable[dict[str, Any]]) -> dict[str, Any]:
    state: dict[str, Any] = {"text": "", "usage": None, "last_event": None, "final_response": None}
    try:
        for event in events:
            _accumulate_event(state, event)
    finally:
        close = getattr(events, "close", None)
        if close:
            close()
    return state


def check_capabilities(model: dict[str, Any], *, input_types: Iterable[str] = (), output_types: Iterable[str] = (), endpoints: Iterable[str] = (), parameters: Iterable[str] = (), parameter_values: dict[str, Any] | None = None) -> dict[str, Any]:
    issues: list[str] = []
    requirements = dict(input_types=list(input_types), output_types=list(output_types), endpoints=list(endpoints), parameters=list(parameters), parameter_values=parameter_values or {})
    status = "retired" if model.get("lifecycle", {}).get("status") == "retired" else model.get("availability", {}).get("status", model.get("status"))
    if status in ("retired", "inactive", "disabled", "coming_soon", "not_listed"):
        issues.append(f"Model is {status}")
    capabilities = model.get("capabilities", {})
    for label, requested, supported in (
        ("input", requirements["input_types"], model.get("modalities", {}).get("input", model.get("input_types"))),
        ("output", requirements["output_types"], model.get("modalities", {}).get("output", model.get("output_types"))),
        ("endpoint", requirements["endpoints"], capabilities.get("endpoints")),
        ("parameter", [*requirements["parameters"], *(parameter_values or {})], capabilities.get("parameters")),
    ):
        for modality in requested:
            if supported is None:
                issues.append(f"{label} capabilities are unknown; cannot verify {modality}")
            elif modality not in supported:
                issues.append(f"{label} {modality} is unsupported (supported: {', '.join(supported) or 'none'})")
    if "offers" in model:
        checks = [check_capabilities({**offer, "capabilities": {**offer.get("capabilities", {}), "endpoints": offer.get("endpoints", offer.get("capabilities", {}).get("endpoints"))}}, **requirements)
            for offer in model["offers"] if offer.get("status") == "active" and offer.get("routable") is not False]
        if not any(check["ok"] for check in checks):
            issues.append("No active provider offer supports all requested capabilities together")
            issues.extend(dict.fromkeys(issue for check in checks for issue in check["issues"]))
    else:
        for parameter, value in (parameter_values or {}).items():
            detail = capabilities.get("parameter_details", {}).get(parameter)
            if not detail:
                issues.append(f"{parameter} constraints are unknown")
                continue
            allowed = detail.get("values", detail.get("enum"))
            if isinstance(allowed, list) and value not in allowed:
                issues.append(f"{parameter} must be one of: {', '.join(map(str, allowed))}")
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                if not math.isfinite(value):
                    issues.append(f"{parameter} must be finite")
                else:
                    if isinstance(detail.get("minimum"), (int, float)) and value < detail["minimum"]:
                        issues.append(f"{parameter} must be at least {detail['minimum']}")
                    if isinstance(detail.get("maximum"), (int, float)) and value > detail["maximum"]:
                        issues.append(f"{parameter} must be at most {detail['maximum']}")
                    if isinstance(detail.get("step"), (int, float)) and detail["step"] > 0:
                        steps = (value - detail.get("minimum", 0)) / detail["step"]
                        if abs(steps - round(steps)) > 1e-8:
                            issues.append(f"{parameter} must use steps of {detail['step']}")
            if detail.get("supported") is False:
                issues.append(f"{parameter} is unsupported")
    return {"ok": not issues, "issues": issues}


def _parameter_route_reference(route: dict[str, Any]) -> dict[str, str]:
    provider = route.get("provider", {}).get("id") or "unknown"
    endpoint = route.get("endpoint") or route.get("capability_id") or "unknown"
    return {
        "id": route.get("id") or f"{provider}:{endpoint}",
        "provider": provider,
        "endpoint": endpoint,
        "public_path": route.get("public_path") or endpoint,
    }


def _matches_parameter_type(value: Any, expected: Any) -> bool:
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return (
            isinstance(value, int) and not isinstance(value, bool)
            or isinstance(value, float) and value.is_integer()
        )
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "null":
        return value is None
    return True


def _parameter_value_issues(name: str, value: Any, detail: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if detail.get("supported") is False:
        issues.append(f"{name} is unsupported")
    if not _matches_parameter_type(value, detail.get("type")):
        article = "an" if detail.get("type") in {"integer", "object"} else "a"
        issues.append(f"{name} must be {article} {detail.get('type')}")
    allowed = detail.get("values", detail.get("enum"))
    if isinstance(allowed, list) and not any(
        item == value and isinstance(item, bool) == isinstance(value, bool)
        for item in allowed
    ):
        issues.append(f"{name} must be one of: {', '.join(map(str, allowed))}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        is_finite = not isinstance(value, float) or math.isfinite(value)
        if not is_finite:
            issues.append(f"{name} must be finite")
        else:
            if isinstance(detail.get("minimum"), (int, float)) and value < detail["minimum"]:
                issues.append(f"{name} must be at least {detail['minimum']}")
            if isinstance(detail.get("maximum"), (int, float)) and value > detail["maximum"]:
                issues.append(f"{name} must be at most {detail['maximum']}")
            if isinstance(detail.get("step"), (int, float)) and detail["step"] > 0:
                steps = (value - detail.get("minimum", 0)) / detail["step"]
                if abs(steps - round(steps)) > 1e-8:
                    issues.append(f"{name} must use steps of {detail['step']}")
    return issues


def check_parameter_support(
    model: dict[str, Any],
    parameter_values: dict[str, Any],
    *,
    endpoint: str | None = None,
    provider: str | Iterable[str] | None = None,
) -> dict[str, Any]:
    """Build a UI-friendly parameter report from live model endpoint metadata."""
    providers = None if provider is None else {provider} if isinstance(provider, str) else set(provider)
    requested_endpoint = endpoint.removeprefix("/v1/").removeprefix("/") if endpoint else None

    routes: list[dict[str, Any]] = []
    for route in model.get("endpoints", []):
        if route.get("routable") is not True or route.get("status") != "active":
            continue
        if providers is not None and route.get("provider", {}).get("id") not in providers:
            continue
        route_endpoints = {
            route.get("endpoint"),
            route.get("capability_id"),
            str(route.get("public_path") or "").removeprefix("/v1/").removeprefix("/"),
        }
        if endpoint and endpoint not in route_endpoints and requested_endpoint not in route_endpoints:
            continue
        routes.append(route)

    parameters: list[dict[str, Any]] = []
    for name, value in parameter_values.items():
        supported_by: list[dict[str, str]] = []
        accepted_by: list[dict[str, str]] = []
        unsupported_by: list[dict[str, str]] = []
        constraints: list[dict[str, Any]] = []
        value_issues: list[str] = []
        known_route_count = 0

        for route in routes:
            reference = _parameter_route_reference(route)
            capabilities = route.get("capabilities") or {}
            advertised = capabilities.get("parameters")
            if not isinstance(advertised, list):
                continue
            known_route_count += 1
            detail = (capabilities.get("parameter_details") or {}).get(name)
            supports_name = name in advertised or isinstance(detail, dict) and detail.get("supported") is True
            if not supports_name or isinstance(detail, dict) and detail.get("supported") is False:
                unsupported_by.append(reference)
                continue
            supported_by.append(reference)
            if isinstance(detail, dict):
                constraints.append({"route": reference, "detail": detail})
                issues = _parameter_value_issues(name, value, detail)
            else:
                issues = []
            if issues:
                value_issues.extend(issues)
            else:
                accepted_by.append(reference)

        if not routes or not known_route_count:
            status = "unknown"
        elif not supported_by:
            status = "unsupported"
        elif not accepted_by:
            status = "unsupported"
        elif len(accepted_by) == len(routes):
            status = "supported"
        else:
            status = "partial"
        issues = (
            [f"{name} is not supported by any matching active route"]
            if status == "unsupported" and not supported_by
            else list(dict.fromkeys(value_issues))
        )
        parameters.append({
            "name": name,
            "value": value,
            "status": status,
            "supported_by": supported_by,
            "accepted_by": accepted_by,
            "unsupported_by": unsupported_by,
            "constraints": constraints,
            "issues": issues,
        })

    matching_routes = [
        _parameter_route_reference(route)
        for route in routes
        if all(
            any(candidate["id"] == _parameter_route_reference(route)["id"] for candidate in parameter["accepted_by"])
            for parameter in parameters
        )
    ]
    issues: list[str] = []
    if not routes:
        issues.append("No active routable model endpoints matched the filters")
    elif parameters and not matching_routes:
        issues.append("No active route supports all requested parameter values together")
    issues.extend(issue for parameter in parameters for issue in parameter["issues"])
    return {
        "ok": bool(routes) and bool(matching_routes),
        "model_id": model.get("id", "unknown"),
        "route_count": len(routes),
        "matching_routes": matching_routes,
        "parameters": parameters,
        "issues": list(dict.fromkeys(issues)),
    }


def batch_results(chunks: Iterable[bytes], max_line_bytes: int = 10 * 1024 * 1024) -> Iterator[dict[str, Any]]:
    pending = b""
    try:
        for chunk in chunks:
            pending += chunk
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                if len(line) > max_line_bytes:
                    raise ValueError("Batch result line exceeds size limit")
                if line.strip():
                    yield _batch_line(line)
            if len(pending) > max_line_bytes:
                raise ValueError("Batch result line exceeds size limit")
        if pending.strip():
            yield _batch_line(pending)
    finally:
        close = getattr(chunks, "close", None)
        if close:
            close()


def _batch_line(line: bytes) -> dict[str, Any]:
    result = json.loads(line)
    if not isinstance(result, dict):
        raise ValueError("Expected a batch result object")
    return result


def match_batch_result(result: dict[str, Any], inputs: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    return inputs[result["custom_id"]], result
