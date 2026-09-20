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
