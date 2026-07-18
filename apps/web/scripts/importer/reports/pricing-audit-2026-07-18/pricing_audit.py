from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


AUDIT_AT = datetime(2026, 7, 17, 23, 30, tzinfo=timezone.utc)
ACTIVE_MODEL_STATUSES = {"Available", "Limited Access"}
ROUTE_ENABLED_STATUSES = {"active"}


def parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def within_window(start: Any, end: Any, at: datetime = AUDIT_AT) -> bool:
    parsed_start = parse_datetime(start)
    parsed_end = parse_datetime(end)
    return (parsed_start is None or at >= parsed_start) and (parsed_end is None or at < parsed_end)


def intervals_overlap(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_start = parse_datetime(left.get("effective_from")) or datetime.min.replace(tzinfo=timezone.utc)
    left_end = parse_datetime(left.get("effective_to")) or datetime.max.replace(tzinfo=timezone.utc)
    right_start = parse_datetime(right.get("effective_from")) or datetime.min.replace(tzinfo=timezone.utc)
    right_end = parse_datetime(right.get("effective_to")) or datetime.max.replace(tzinfo=timezone.utc)
    return left_start < right_end and right_start < left_end


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def normalize_status(value: Any) -> str:
    return str(value or "").strip().lower()


def route_enabled(value: Any) -> bool:
    status = normalize_status(value)
    return status in ROUTE_ENABLED_STATUSES or status.startswith("deranked_")


def pricing_candidate_capabilities(route: dict[str, Any]) -> list[str]:
    capability = route["capability_id"]
    aliases = {
        "text.generate": ["text.generate", "responses", "chat.completions", "messages", "chat.generate", "text"],
        "text.embed": ["text.embed", "embeddings"],
        "text.rerank": ["text.rerank", "rerank", "rerank.create"],
        "text.moderate": ["text.moderate", "moderations", "moderations.create", "moderation"],
        "audio.speech": ["audio.speech", "audio.generate"],
        "image.generate": ["image.generate", "image.generations", "images.generate", "images.generations"],
        "images.generations": ["images.generations", "images.generate", "image.generate", "image.generations"],
    }
    if capability != "batch":
        return aliases.get(capability, [capability])

    params = route.get("capability_params")
    endpoint_values: list[str] = []
    if isinstance(params, dict):
        endpoint = params.get("endpoint")
        if isinstance(endpoint, dict) and isinstance(endpoint.get("values"), list):
            endpoint_values = [str(value) for value in endpoint["values"]]
    candidates: list[str] = []
    for endpoint in endpoint_values or [""]:
        if endpoint in {"/v1/embeddings", "/embeddings"}:
            candidates.extend(["text.embed", "embeddings"])
        elif endpoint in {"/v1/videos", "/videos"}:
            candidates.extend(["video.generate", "video.generation"])
        elif endpoint in {"/v1/images/generations", "/images/generations"}:
            candidates.extend(["image.generate", "image.generations", "images.generations", "images.generate"])
        elif endpoint in {"/v1/images/edits", "/images/edits"}:
            candidates.extend(["image.edit", "images.edits"])
        elif endpoint in {"/v1/moderations", "/moderations"}:
            candidates.extend(["text.moderate", "moderations.create", "moderation"])
        elif endpoint in {"/v1/responses", "/responses", "/v1/chat/completions", "/chat/completions"}:
            candidates.extend(["text.generate", "batch"])
        else:
            candidates.append("batch")
    return list(dict.fromkeys(candidates))


def pricing_candidate_model_ids(route: dict[str, Any]) -> list[str]:
    candidates = [str(route.get("model_id") or "").strip()]
    provider_slug = str(route.get("provider_model_slug") or "").strip()
    if provider_slug:
        candidates.append(provider_slug)
    provider_api_model_id = str(route.get("provider_api_model_id") or "").strip()
    prefix = f"{route.get('provider_id')}:"
    if provider_api_model_id.startswith(prefix):
        candidates.append(provider_api_model_id[len(prefix) :])
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def pricing_candidate_keys(route: dict[str, Any]) -> list[str]:
    return [
        f"{route['provider_id']}:{model_id}:{capability_id}"
        for model_id in pricing_candidate_model_ids(route)
        for capability_id in pricing_candidate_capabilities(route)
    ]


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def numeric(value: Any) -> float | None:
    try:
        parsed = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return parsed


def current_rule(entry: dict[str, Any], rule: dict[str, Any]) -> bool:
    return within_window(entry.get("effective_from"), entry.get("effective_to")) and within_window(
        rule.get("effective_from"), rule.get("effective_to")
    )


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "packages/data/catalog/src/data").exists():
            return candidate
    raise RuntimeError("Run from the ai-stats-public repository or a descendant directory")


@dataclass(frozen=True)
class Paths:
    root: Path
    data: Path
    models: Path
    pricing: Path
    providers: Path
    output: Path


def resolve_paths(root: Path | None = None) -> Paths:
    resolved_root = find_repo_root(root)
    data = resolved_root / "packages/data/catalog/src/data"
    output = resolved_root / "apps/web/scripts/importer/reports/pricing-audit-2026-07-18"
    return Paths(
        root=resolved_root,
        data=data,
        models=data / "models",
        pricing=data / "pricing",
        providers=data / "api_providers",
        output=output,
    )


def load_models(paths: Paths) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    by_id: dict[str, dict[str, Any]] = {}
    for path in sorted(paths.models.rglob("model.json")):
        model = read_json(path)
        model_id = str(model.get("model_id") or "").strip()
        row = {
            "model_id": model_id,
            "api_model_id": str(model.get("api_model_id") or "").strip() or None,
            "organisation_id": model.get("organisation_id"),
            "name": model.get("name"),
            "status": model.get("status"),
            "release_date": model.get("release_date"),
            "deprecation_date": model.get("deprecation_date"),
            "retirement_date": model.get("retirement_date"),
            "source_path": path.relative_to(paths.root).as_posix(),
        }
        rows.append(row)
        if model_id:
            by_id[model_id] = row
    return rows, by_id


def load_pricing(paths: Paths) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    entries: list[dict[str, Any]] = []
    rules: list[dict[str, Any]] = []
    for path in sorted(paths.pricing.rglob("pricing.json")):
        entry = read_json(path)
        provider_id = str(entry.get("api_provider_id") or "").strip()
        model_id = str(entry.get("api_model_id") or entry.get("model_id") or "").strip()
        capability_id = str(entry.get("capability_id") or entry.get("endpoint") or path.parent.name).strip()
        key = str(entry.get("key") or f"{provider_id}:{model_id}:{capability_id}").strip()
        current_rules = [rule for rule in entry.get("rules") or [] if current_rule(entry, rule)]
        entry_row = {
            "key": key,
            "provider_id": provider_id,
            "model_id": model_id,
            "capability_id": capability_id,
            "rule_count": len(entry.get("rules") or []),
            "current_rule_count": len(current_rules),
            "has_current_pricing": bool(current_rules),
            "source_path": path.relative_to(paths.root).as_posix(),
        }
        entries.append(entry_row)
        for index, rule in enumerate(entry.get("rules") or []):
            unit_size = numeric(rule.get("unit_size"))
            price = numeric(rule.get("price_per_unit"))
            normalized_per_million = None
            if rule.get("unit") == "token" and unit_size and price is not None:
                normalized_per_million = price / unit_size * 1_000_000
            rules.append(
                {
                    "key": key,
                    "provider_id": provider_id,
                    "model_id": model_id,
                    "capability_id": capability_id,
                    "rule_index": index,
                    "meter": rule.get("meter"),
                    "unit": rule.get("unit"),
                    "unit_size": unit_size,
                    "price_per_unit": price,
                    "normalized_per_million_tokens": normalized_per_million,
                    "currency": rule.get("currency"),
                    "pricing_plan": rule.get("pricing_plan") or "standard",
                    "priority": rule.get("priority", 100),
                    "match": rule.get("match") or [],
                    "bill": rule.get("bill"),
                    "effective_from": rule.get("effective_from") or entry.get("effective_from"),
                    "effective_to": rule.get("effective_to") or entry.get("effective_to"),
                    "is_current": current_rule(entry, rule),
                    "source_path": path.relative_to(paths.root).as_posix(),
                }
            )
    return entries, rules


def load_provider_metadata(paths: Paths) -> dict[str, dict[str, Any]]:
    metadata: dict[str, dict[str, Any]] = {}
    for path in sorted(paths.providers.glob("*/api_provider.json")):
        provider_id = path.parent.name
        raw = read_json(path)
        metadata[provider_id] = {
            "provider_id": provider_id,
            "name": raw.get("name") or raw.get("api_provider_name") or provider_id,
            "pricing_source_url": raw.get("pricing_source_url"),
            "source_path": path.relative_to(paths.root).as_posix(),
        }
    return metadata


def load_provider_routes(paths: Paths) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    for path in sorted(paths.providers.glob("*/models.json")):
        provider_id = path.parent.name
        for model in read_json(path):
            if not model.get("is_active_gateway"):
                continue
            if not within_window(model.get("effective_from"), model.get("effective_to")):
                continue
            model_id = str(model.get("api_model_id") or "").strip()
            for capability in model.get("capabilities") or []:
                if not route_enabled(capability.get("status")):
                    continue
                if not within_window(capability.get("effective_from"), capability.get("effective_to")):
                    continue
                capability_id = str(capability.get("capability_id") or "").strip()
                if not capability_id:
                    continue
                routes.append(
                    {
                        "provider_id": provider_id,
                        "model_id": model_id,
                        "capability_id": capability_id,
                        "capability_status": normalize_status(capability.get("status")),
                        "provider_api_model_id": model.get("provider_api_model_id"),
                        "provider_model_slug": model.get("provider_model_slug"),
                        "internal_model_id": model.get("internal_model_id"),
                        "capability_params": capability.get("params"),
                        "pricing_key": f"{provider_id}:{model_id}:{capability_id}",
                        "source_path": path.relative_to(paths.root).as_posix(),
                    }
                )
    return routes


def price_pairs(current_rules: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cached_read_anomalies: list[dict[str, Any]] = []
    batch_anomalies: list[dict[str, Any]] = []
    by_entry_plan_match: dict[tuple[str, str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
    for rule in current_rules:
        match_key = canonical_json(rule.get("match") or [])
        by_entry_plan_match[(rule["key"], rule["pricing_plan"], match_key)][str(rule["meter"])] = rule

    for (entry_key, plan, match_key), meter_rules in by_entry_plan_match.items():
        input_rule = meter_rules.get("input_text_tokens") or meter_rules.get("input_tokens")
        cached_rule = meter_rules.get("cached_read_text_tokens")
        if input_rule and cached_rule:
            input_price = input_rule.get("normalized_per_million_tokens")
            cached_price = cached_rule.get("normalized_per_million_tokens")
            if input_price is not None and cached_price is not None and cached_price > input_price:
                cached_read_anomalies.append(
                    {
                        "pricing_key": entry_key,
                        "pricing_plan": plan,
                        "input_price_per_million": input_price,
                        "cached_read_price_per_million": cached_price,
                        "ratio": cached_price / input_price if input_price else None,
                        "source_path": cached_rule["source_path"],
                    }
                )

    standard_index: dict[tuple[str, str, str], dict[str, Any]] = {}
    batch_index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for rule in current_rules:
        identity = (rule["key"], str(rule["meter"]), canonical_json(rule.get("match") or []))
        if rule["pricing_plan"] == "standard":
            standard_index[identity] = rule
        elif rule["pricing_plan"] == "batch":
            batch_index[identity] = rule
    for identity, batch_rule in batch_index.items():
        standard_rule = standard_index.get(identity)
        if not standard_rule:
            continue
        batch_price = batch_rule.get("normalized_per_million_tokens")
        standard_price = standard_rule.get("normalized_per_million_tokens")
        if batch_price is not None and standard_price is not None and batch_price > standard_price:
            batch_anomalies.append(
                {
                    "pricing_key": identity[0],
                    "meter": identity[1],
                    "standard_price_per_million": standard_price,
                    "batch_price_per_million": batch_price,
                    "ratio": batch_price / standard_price if standard_price else None,
                    "source_path": batch_rule["source_path"],
                }
            )
    return cached_read_anomalies, batch_anomalies


def overlapping_rules(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for rule in rules:
        identity = (
            rule["key"],
            rule["meter"],
            rule["pricing_plan"],
            rule["priority"],
            canonical_json(rule.get("match") or []),
            canonical_json(rule.get("bill")),
        )
        groups[identity].append(rule)

    anomalies: list[dict[str, Any]] = []
    for identity, group in groups.items():
        if len(group) < 2:
            continue
        for left_index, left in enumerate(group):
            for right in group[left_index + 1 :]:
                if not intervals_overlap(left, right):
                    continue
                if left.get("price_per_unit") == right.get("price_per_unit"):
                    continue
                anomalies.append(
                    {
                        "pricing_key": identity[0],
                        "meter": identity[1],
                        "pricing_plan": identity[2],
                        "priority": identity[3],
                        "left_price": left.get("price_per_unit"),
                        "left_from": left.get("effective_from"),
                        "left_to": left.get("effective_to"),
                        "right_price": right.get("price_per_unit"),
                        "right_from": right.get("effective_from"),
                        "right_to": right.get("effective_to"),
                        "source_path": left["source_path"],
                    }
                )
    return anomalies


def cross_provider_spreads(current_rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for rule in current_rules:
        if rule.get("currency") != "USD" or rule.get("pricing_plan") != "standard":
            continue
        price = rule.get("normalized_per_million_tokens")
        if price is None or price <= 0:
            continue
        if rule.get("match"):
            continue
        if rule.get("meter") not in {"input_tokens", "input_text_tokens", "output_tokens", "output_text_tokens"}:
            continue
        grouped[(rule["model_id"], str(rule["meter"]))].append(rule)

    spreads: list[dict[str, Any]] = []
    for (model_id, meter), group in grouped.items():
        by_provider: dict[str, dict[str, Any]] = {}
        for rule in group:
            prior = by_provider.get(rule["provider_id"])
            if prior is None or rule["normalized_per_million_tokens"] < prior["normalized_per_million_tokens"]:
                by_provider[rule["provider_id"]] = rule
        values = list(by_provider.values())
        if len(values) < 2:
            continue
        lowest = min(values, key=lambda row: row["normalized_per_million_tokens"])
        highest = max(values, key=lambda row: row["normalized_per_million_tokens"])
        ratio = highest["normalized_per_million_tokens"] / lowest["normalized_per_million_tokens"]
        spreads.append(
            {
                "model_id": model_id,
                "meter": meter,
                "provider_count": len(values),
                "lowest_provider": lowest["provider_id"],
                "lowest_usd_per_million": lowest["normalized_per_million_tokens"],
                "highest_provider": highest["provider_id"],
                "highest_usd_per_million": highest["normalized_per_million_tokens"],
                "max_to_min_ratio": ratio,
            }
        )
    return sorted(spreads, key=lambda row: (-row["max_to_min_ratio"], row["model_id"], row["meter"]))


def provider_coverage(
    entries: list[dict[str, Any]],
    rules: list[dict[str, Any]],
    routes: list[dict[str, Any]],
    provider_metadata: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    entry_counts = Counter(row["provider_id"] for row in entries)
    current_entry_counts = Counter(row["provider_id"] for row in entries if row["has_current_pricing"])
    current_rule_counts = Counter(row["provider_id"] for row in rules if row["is_current"])
    route_counts = Counter(row["provider_id"] for row in routes)
    providers = sorted(set(entry_counts) | set(route_counts))
    rows = []
    current_entry_by_key = {row["key"]: row["has_current_pricing"] for row in entries}
    current_keys = {key for key, is_current in current_entry_by_key.items() if is_current}
    for provider_id in providers:
        provider_routes = [row for row in routes if row["provider_id"] == provider_id]
        missing = [row for row in provider_routes if not current_entry_by_key.get(row["pricing_key"], False)]
        unresolved = [
            row
            for row in missing
            if not any(candidate_key in current_keys for candidate_key in pricing_candidate_keys(row))
        ]
        route_total = route_counts[provider_id]
        metadata = provider_metadata.get(provider_id, {})
        rows.append(
            {
                "provider_id": provider_id,
                "active_route_count": route_total,
                "priced_active_route_count": route_total - len(missing),
                "missing_active_route_count": len(missing),
                "unresolved_missing_active_route_count": len(unresolved),
                "route_pricing_coverage_rate": (route_total - len(missing)) / route_total if route_total else None,
                "route_pricing_coverage_rate_after_capability_aliases": (
                    (route_total - len(unresolved)) / route_total if route_total else None
                ),
                "pricing_entry_count": entry_counts[provider_id],
                "current_pricing_entry_count": current_entry_counts[provider_id],
                "current_rule_count": current_rule_counts[provider_id],
                "has_pricing_source_url": bool(metadata.get("pricing_source_url")),
                "pricing_source_url": metadata.get("pricing_source_url"),
            }
        )
    return sorted(rows, key=lambda row: (-row["active_route_count"], row["provider_id"]))


def build_audit(root: Path | None = None) -> dict[str, Any]:
    paths = resolve_paths(root)
    models, model_by_id = load_models(paths)
    entries, rules = load_pricing(paths)
    routes = load_provider_routes(paths)
    provider_metadata = load_provider_metadata(paths)

    active_models = [row for row in models if row["status"] in ACTIVE_MODEL_STATUSES]
    current_entries = [row for row in entries if row["has_current_pricing"]]
    current_rules = [row for row in rules if row["is_current"]]
    entry_by_key = {row["key"]: row for row in entries}
    current_pricing_keys = {row["key"] for row in current_entries}
    all_pricing_keys = {row["key"] for row in entries}

    route_gaps = []
    for route in routes:
        if route["pricing_key"] in current_pricing_keys:
            continue
        candidate_keys = pricing_candidate_keys(route)
        alternate_current_keys = [key for key in candidate_keys if key in current_pricing_keys]
        route_gaps.append(
            {
                **route,
                "gap_type": (
                    "alternate_pricing_key_only"
                    if alternate_current_keys
                    else "missing_file"
                    if route["pricing_key"] not in all_pricing_keys
                    else "no_current_rule"
                ),
                "alternate_current_pricing_keys": alternate_current_keys,
            }
        )

    current_priced_model_ids = {row["model_id"] for row in current_entries}
    active_route_model_ids = {
        str(row.get("internal_model_id") or row["model_id"]).strip()
        for row in routes
    }
    route_priced_catalog_model_ids = {
        str(route.get("internal_model_id") or route["model_id"]).strip()
        for route in routes
        if any(candidate_key in current_pricing_keys for candidate_key in pricing_candidate_keys(route))
    }
    model_rows: list[dict[str, Any]] = []
    for model in active_models:
        identifiers = {model["model_id"]}
        if model.get("api_model_id"):
            identifiers.add(str(model["api_model_id"]))
        has_active_route = bool(identifiers & active_route_model_ids)
        has_current_price = bool(identifiers & current_priced_model_ids) or model["model_id"] in route_priced_catalog_model_ids
        model_rows.append(
            {
                **model,
                "has_active_gateway_route": has_active_route,
                "has_current_pricing": has_current_price,
                "coverage_class": (
                    "active_route_and_priced"
                    if has_active_route and has_current_price
                    else "active_route_unpriced"
                    if has_active_route
                    else "priced_without_active_route"
                    if has_current_price
                    else "no_active_route_or_current_price"
                ),
            }
        )

    duplicate_keys = [
        {"pricing_key": key, "file_count": count}
        for key, count in Counter(row["key"] for row in entries).items()
        if count > 1
    ]
    stale_entries = [row for row in entries if not row["has_current_pricing"]]
    current_zero_rules = [row for row in current_rules if row.get("price_per_unit") == 0]
    current_non_usd_rules = [row for row in current_rules if row.get("currency") != "USD"]
    current_missing_currency_rules = [row for row in current_rules if not row.get("currency")]
    cached_anomalies, batch_anomalies = price_pairs(current_rules)
    overlap_anomalies = overlapping_rules(rules)
    provider_model_to_internal = {
        (row["provider_id"], row["model_id"]): str(row.get("internal_model_id") or "").strip()
        for row in routes
        if row.get("internal_model_id")
    }
    for anomaly in overlap_anomalies:
        provider_id, model_id, _ = anomaly["pricing_key"].split(":", 2)
        catalog_model_id = provider_model_to_internal.get((provider_id, model_id), model_id)
        anomaly["catalog_model_id"] = catalog_model_id
        anomaly["model_status"] = model_by_id.get(catalog_model_id, {}).get("status")
    current_missing_model_refs = sorted(
        {
            row["model_id"]
            for row in current_entries
            if row["model_id"]
            and row["model_id"] not in model_by_id
            and provider_model_to_internal.get((row["provider_id"], row["model_id"])) not in model_by_id
        }
    )
    route_missing_model_refs = sorted(
        {
            str(row.get("internal_model_id") or row["model_id"]).strip()
            for row in routes
            if str(row.get("internal_model_id") or row["model_id"]).strip()
            and str(row.get("internal_model_id") or row["model_id"]).strip() not in model_by_id
        }
    )
    spreads = cross_provider_spreads(current_rules)
    provider_rows = provider_coverage(entries, rules, routes, provider_metadata)

    active_route_models = [row for row in model_rows if row["has_active_gateway_route"]]
    active_route_priced_models = [row for row in active_route_models if row["has_current_pricing"]]
    priced_active_models = [row for row in model_rows if row["has_current_pricing"]]
    current_pricing_providers = {row["provider_id"] for row in current_entries}
    sourced_current_pricing_providers = {
        provider_id
        for provider_id in current_pricing_providers
        if provider_metadata.get(provider_id, {}).get("pricing_source_url")
    }
    exact_active_routes = [row for row in routes if row["capability_status"] == "active"]
    deranked_active_routes = [row for row in routes if row["capability_status"].startswith("deranked_")]
    unresolved_route_gaps = [row for row in route_gaps if row["gap_type"] != "alternate_pricing_key_only"]
    active_overlap_anomalies = [row for row in overlap_anomalies if row.get("model_status") in ACTIVE_MODEL_STATUSES]

    summary = {
        "audit_at": AUDIT_AT.isoformat().replace("+00:00", "Z"),
        "model_files": len(models),
        "catalog_active_models": len(active_models),
        "available_models": sum(row["status"] == "Available" for row in models),
        "limited_access_models": sum(row["status"] == "Limited Access" for row in models),
        "active_models_with_current_pricing": len(priced_active_models),
        "active_model_pricing_coverage_rate": len(priced_active_models) / len(active_models) if active_models else None,
        "active_models_with_gateway_route": len(active_route_models),
        "active_gateway_models_with_current_pricing": len(active_route_priced_models),
        "active_gateway_model_pricing_coverage_rate": (
            len(active_route_priced_models) / len(active_route_models) if active_route_models else None
        ),
        "provider_model_routes": len(routes),
        "provider_model_routes_status_active": len(exact_active_routes),
        "provider_model_routes_status_deranked": len(deranked_active_routes),
        "priced_provider_model_routes": len(routes) - len(route_gaps),
        "route_pricing_gap_count": len(route_gaps),
        "route_pricing_gap_count_after_capability_aliases": len(unresolved_route_gaps),
        "alternate_pricing_key_gap_count": len(route_gaps) - len(unresolved_route_gaps),
        "route_pricing_coverage_rate": (len(routes) - len(route_gaps)) / len(routes) if routes else None,
        "route_pricing_coverage_rate_after_capability_aliases": (
            (len(routes) - len(unresolved_route_gaps)) / len(routes) if routes else None
        ),
        "pricing_files": len(entries),
        "current_pricing_files": len(current_entries),
        "pricing_rules": len(rules),
        "current_pricing_rules": len(current_rules),
        "current_free_rules": len(current_zero_rules),
        "pricing_providers": len({row["provider_id"] for row in entries}),
        "current_pricing_providers": len(current_pricing_providers),
        "current_pricing_providers_with_source_url": len(sourced_current_pricing_providers),
        "current_pricing_provider_source_coverage_rate": (
            len(sourced_current_pricing_providers) / len(current_pricing_providers)
            if current_pricing_providers
            else None
        ),
        "duplicate_pricing_keys": len(duplicate_keys),
        "pricing_files_without_current_rules": len(stale_entries),
        "overlapping_conflicting_rule_pairs": len(overlap_anomalies),
        "active_model_overlapping_conflicting_rule_pairs": len(active_overlap_anomalies),
        "cached_read_more_expensive_than_input": len(cached_anomalies),
        "batch_more_expensive_than_standard": len(batch_anomalies),
        "current_non_usd_rules": len(current_non_usd_rules),
        "current_missing_currency_rules": len(current_missing_currency_rules),
        "current_pricing_model_refs_missing_from_catalog": len(current_missing_model_refs),
        "active_route_model_refs_missing_from_catalog": len(route_missing_model_refs),
    }

    gap_by_provider = [
        {"provider_id": provider_id, "missing_route_count": count}
        for provider_id, count in Counter(row["provider_id"] for row in route_gaps).most_common()
    ]
    coverage_classes = [
        {"coverage_class": name, "model_count": count}
        for name, count in Counter(row["coverage_class"] for row in model_rows).most_common()
    ]
    source_coverage = [
        {
            "source_status": "pricing source URL present" if has_source else "pricing source URL missing",
            "provider_count": sum(
                1
                for provider_id in current_pricing_providers
                if bool(provider_metadata.get(provider_id, {}).get("pricing_source_url")) == has_source
            ),
        }
        for has_source in [True, False]
    ]

    return {
        "summary": summary,
        "model_coverage": sorted(model_rows, key=lambda row: (row["coverage_class"], row["model_id"])),
        "coverage_classes": coverage_classes,
        "provider_coverage": provider_rows,
        "source_coverage": source_coverage,
        "route_gaps": sorted(route_gaps, key=lambda row: (row["provider_id"], row["model_id"], row["capability_id"])),
        "gap_by_provider": gap_by_provider,
        "duplicate_pricing_keys": duplicate_keys,
        "stale_pricing_entries": stale_entries,
        "overlapping_rules": overlap_anomalies,
        "cached_read_anomalies": cached_anomalies,
        "batch_anomalies": batch_anomalies,
        "cross_provider_spreads": spreads,
        "top_cross_provider_spreads": spreads[:50],
        "current_non_usd_rules": current_non_usd_rules,
        "current_missing_currency_rules": current_missing_currency_rules,
        "current_pricing_model_refs_missing_from_catalog": current_missing_model_refs,
        "active_route_model_refs_missing_from_catalog": route_missing_model_refs,
        "current_free_rules": current_zero_rules,
    }


def write_outputs(audit: dict[str, Any], root: Path | None = None) -> None:
    paths = resolve_paths(root)
    paths.output.mkdir(parents=True, exist_ok=True)
    outputs = {
        "analysis-summary.json": audit["summary"],
        "model-coverage.json": audit["model_coverage"],
        "provider-coverage.json": audit["provider_coverage"],
        "route-pricing-gaps.json": audit["route_gaps"],
        "pricing-anomalies.json": {
            "duplicate_pricing_keys": audit["duplicate_pricing_keys"],
            "stale_pricing_entries": audit["stale_pricing_entries"],
            "overlapping_rules": audit["overlapping_rules"],
            "cached_read_anomalies": audit["cached_read_anomalies"],
            "batch_anomalies": audit["batch_anomalies"],
            "top_cross_provider_spreads": audit["top_cross_provider_spreads"],
            "current_non_usd_rules": audit["current_non_usd_rules"],
            "current_missing_currency_rules": audit["current_missing_currency_rules"],
            "current_pricing_model_refs_missing_from_catalog": audit[
                "current_pricing_model_refs_missing_from_catalog"
            ],
            "active_route_model_refs_missing_from_catalog": audit["active_route_model_refs_missing_from_catalog"],
        },
    }
    for name, payload in outputs.items():
        (paths.output / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    result = build_audit()
    write_outputs(result)
    print(json.dumps(result["summary"], indent=2))
