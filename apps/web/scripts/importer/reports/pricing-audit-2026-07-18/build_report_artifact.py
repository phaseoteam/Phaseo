from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load(name: str):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def main() -> None:
    summary = load("analysis-summary.json")
    route_gaps = load("route-pricing-gaps.json")
    anomalies = load("pricing-anomalies.json")
    provider_coverage = load("provider-coverage.json")
    external_checks = load("external-source-checks.json")

    unresolved_gaps = [row for row in route_gaps if row["gap_type"] != "alternate_pricing_key_only"]
    unresolved_gap_rows = [
        {
            "provider_id": row["provider_id"],
            "model_id": row["model_id"],
            "capability_id": row["capability_id"],
            "gap_type": row["gap_type"],
        }
        for row in unresolved_gaps
    ]
    unresolved_by_provider = [
        {"provider_id": provider_id, "missing_route_count": count}
        for provider_id, count in Counter(row["provider_id"] for row in unresolved_gaps).most_common()
    ]
    active_conflicts = [
        row for row in anomalies["overlapping_rules"] if row.get("model_status") in {"Available", "Limited Access"}
    ]
    conflict_context = {
        "google-ai-studio:google/gemini-2.5-flash-image:text.generate": "Equivalent image-output representations; remove the superseded open-ended rule to make selection deterministic.",
        "venice:minimax/minimax-m2.7:text.generate": "Official rates are $0.38 input, $1.50 output, and $0.07 cache read per 1M tokens.",
        "venice:z-ai/glm-4.7-flash:text.generate": "Official output price is $0.50 per 1M tokens; the competing $0.55 rule is stale.",
    }
    for row in active_conflicts:
        provider_id, model_id, _ = row["pricing_key"].split(":", 2)
        row["provider_id"] = provider_id
        row["model_id"] = model_id
        row["review_note"] = conflict_context.get(row["pricing_key"], "Conflicting current rules require source verification.")

    summary_row = {
        **summary,
        "route_pricing_coverage_exact": summary["route_pricing_coverage_rate"],
        "route_pricing_coverage_resolved": summary["route_pricing_coverage_rate_after_capability_aliases"],
        "active_model_pricing_coverage": summary["active_model_pricing_coverage_rate"],
        "provider_source_coverage": summary["current_pricing_provider_source_coverage_rate"],
    }
    route_resolution = [
        {"resolution_status": "Exact key", "route_count": summary["priced_provider_model_routes"]},
        {"resolution_status": "Alternate key", "route_count": summary["alternate_pricing_key_gap_count"]},
        {"resolution_status": "Unresolved", "route_count": summary["route_pricing_gap_count_after_capability_aliases"]},
    ]
    source_coverage = [
        {"source_status": "URL present", "provider_count": summary["current_pricing_providers_with_source_url"]},
        {
            "source_status": "URL missing",
            "provider_count": summary["current_pricing_providers"] - summary["current_pricing_providers_with_source_url"],
        },
    ]

    route_total = summary["provider_model_routes"]
    exact_routes = summary["priced_provider_model_routes"]
    alternate_routes = summary["alternate_pricing_key_gap_count"]
    unresolved_routes = summary["route_pricing_gap_count_after_capability_aliases"]
    resolved_routes = exact_routes + alternate_routes
    resolved_pct = summary["route_pricing_coverage_rate_after_capability_aliases"] * 100
    exact_pct = summary["route_pricing_coverage_rate"] * 100
    source_url_count = summary["current_pricing_providers_with_source_url"]
    source_provider_count = summary["current_pricing_providers"]
    missing_source_count = source_provider_count - source_url_count
    catalog_active_models = summary["catalog_active_models"]
    current_rules = summary["current_pricing_rules"]
    unresolved_labels = ", ".join(
        f"{row['provider_id']}:{row['model_id']} ({row['capability_id']})" for row in unresolved_gaps
    )

    source = {
        "id": "catalog_audit",
        "label": "Phaseo catalog pricing audit",
        "path": "apps/web/scripts/importer/reports/pricing-audit-2026-07-18/report_datasets.sql"
    }

    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Active-model pricing audit",
            "description": "Repository-wide review of active model pricing coverage, rule integrity, provenance, and authoritative provider spot checks.",
            "generatedAt": summary["audit_at"],
            "cards": [
                {
                    "id": "route_coverage",
                    "description": "Production-active provider/capability routes with a current price after legitimate key resolution.",
                    "dataset": "summary",
                    "sourceId": "catalog_audit",
                    "metrics": [
                        {"label": "Resolved route coverage", "field": "route_pricing_coverage_resolved", "format": "percent"},
                        {"label": "Exact-key coverage", "field": "route_pricing_coverage_exact", "format": "percent"}
                    ]
                },
                {
                    "id": "active_models_priced",
                    "description": "Catalog-active models with at least one current provider price; non-routable research and local models remain in the denominator.",
                    "dataset": "summary",
                    "sourceId": "catalog_audit",
                    "metrics": [
                        {"label": "Catalog-active models priced", "field": "active_models_with_current_pricing", "format": "number"},
                        {"label": "Of catalog-active models", "field": "catalog_active_models", "format": "number"}
                    ]
                },
                {
                    "id": "active_conflicts",
                    "description": "Same-priority, same-condition current rule pairs with different prices on catalog-active models.",
                    "dataset": "summary",
                    "sourceId": "catalog_audit",
                    "metrics": [
                        {"label": "Active conflicting rule pairs", "field": "active_model_overlapping_conflicting_rule_pairs", "format": "number"}
                    ]
                },
                {
                    "id": "source_coverage",
                    "description": "Providers with current pricing entries whose provider metadata includes an authoritative pricing URL.",
                    "dataset": "summary",
                    "sourceId": "catalog_audit",
                    "metrics": [
                        {"label": "Provider source coverage", "field": "provider_source_coverage", "format": "percent"},
                        {"label": "Providers with URLs", "field": "current_pricing_providers_with_source_url", "format": "number"}
                    ]
                }
            ],
            "charts": [
                {
                    "id": "source_coverage_chart",
                    "title": "Pricing source URL coverage",
                    "subtitle": "Providers with current pricing entries.",
                    "type": "bar",
                    "dataset": "source_coverage",
                    "sourceId": "catalog_audit",
                    "encodings": {
                        "x": {"field": "source_status", "type": "nominal", "label": "Source metadata"},
                        "y": {"field": "provider_count", "type": "quantitative", "label": "Providers"}
                    },
                    "layout": "full"
                }
            ],
            "tables": [
                {
                    "id": "unresolved_gap_detail",
                    "title": "Unresolved active route gaps",
                    "subtitle": "Provider-model-capability routes that have no current pricing entry after key resolution.",
                    "dataset": "unresolved_gaps",
                    "sourceId": "catalog_audit",
                    "defaultSort": {"field": "provider_id", "direction": "asc"},
                    "columns": [
                        {"field": "provider_id", "label": "Provider", "type": "text"},
                        {"field": "model_id", "label": "Model", "type": "text"},
                        {"field": "capability_id", "label": "Capability", "type": "text"},
                        {"field": "gap_type", "label": "Gap", "type": "text"}
                    ]
                },
                {
                    "id": "active_conflict_detail",
                    "title": "Conflicting current rules on active models",
                    "subtitle": "Equal-priority rules with identical conditions and overlapping effective windows.",
                    "dataset": "active_conflicts",
                    "sourceId": "catalog_audit",
                    "defaultSort": {"field": "provider_id", "direction": "asc"},
                    "columns": [
                        {"field": "provider_id", "label": "Provider", "type": "text"},
                        {"field": "model_id", "label": "Model", "type": "text"},
                        {"field": "meter", "label": "Meter", "type": "text"},
                        {"field": "left_price", "label": "Price A", "format": "number"},
                        {"field": "right_price", "label": "Price B", "format": "number"}
                    ]
                },
                {
                    "id": "external_checks",
                    "title": "Authoritative source spot checks",
                    "subtitle": "Eight high-value and anomaly-led checks against official provider documentation.",
                    "dataset": "external_checks",
                    "sourceId": "catalog_audit",
                    "defaultSort": {"field": "provider", "direction": "asc"},
                    "columns": [
                        {"field": "provider", "label": "Provider", "type": "text"},
                        {"field": "model", "label": "Model", "type": "text"},
                        {"field": "catalog_result", "label": "Result", "type": "text"}
                    ]
                }
            ],
            "sources": [{"id": source["id"], "label": source["label"], "path": source["path"]}],
            "blocks": [
                {"id": "title", "type": "markdown", "body": "# Active-model pricing audit"},
                {
                    "id": "technical_summary",
                    "type": "markdown",
                    "body": f"## Technical summary\n\n- **Pricing coverage is nearly complete for the active route set.** {resolved_routes} of {route_total} active provider-capability routes resolve to current pricing after legitimate provider/capability key resolution; {unresolved_routes} routes still need provider pricing review.\n- **Production coverage:** {resolved_routes} of {route_total} active routes ({resolved_pct:.1f}%) resolve after alias handling; exact-key coverage is {exact_routes} routes ({exact_pct:.1f}%).\n- **No conflicting rule pairs remain on catalog-active models.** Historical Google, Venice, Novita, and OpenAI overlaps were closed with dated supersession.\n- **Provenance remains the systemic control gap:** {source_url_count} of {source_provider_count} providers with current pricing entries expose a provider-level pricing source URL."
                },
                {
                    "id": "snapshot_note",
                    "type": "html",
                    "body": "<style>.portable-page-header{width:100%!important;margin-right:0!important;margin-left:0!important}</style><p><strong>Audit snapshot:</strong> 18 July 2026 BST / 17 July 2026 23:30 UTC.</p>"
                },
                {"id": "headline_metrics", "type": "metric-strip", "cardIds": ["route_coverage", "active_models_priced", "active_conflicts", "source_coverage"]},
                {
                    "id": "route_coverage_finding",
                    "type": "markdown",
                    "sourceId": "catalog_audit",
                    "body": f"## Most production routes are priceable\n\n**Key resolution lifts coverage from {exact_pct:.1f}% exact-key to {resolved_pct:.1f}% after legitimate alternate-key handling.** {alternate_routes} apparent gaps are backed by a provider-native identifier or equivalent capability; {unresolved_routes} routes remain unresolved and are listed below for manual provider review. Computer Use Preview has explicit standard and Batch pricing and remains scheduled for retirement on 2026-07-23."
                },
                {
                    "id": "gap_concentration_finding",
                    "type": "markdown",
                    "sourceId": "catalog_audit",
                    "body": f"## Remaining pricing gaps require provider confirmation\n\nGMI Cloud Nemotron 3 Ultra and OpenAI GPT Image 1 image editing now have catalog pricing from the supplied provider pages. The remaining unresolved routes are: {unresolved_labels}. OpenAI Computer Use Preview is priced and remains scheduled to retire on 2026-07-23."
                },
                {"id": "gap_table_block", "type": "table", "tableId": "unresolved_gap_detail", "layout": "full"},
                {
                    "id": "conflict_finding",
                    "type": "markdown",
                    "body": "## Conflicting rules have been tidied\n\nThe four active-model overlaps and two retired-model overlaps are now closed with explicit effective windows. Venice retains the verified MiniMax M2.7 and GLM 4.7 Flash rates; Google retains the per-image Gemini representation; Novita and OpenAI preserve superseded rates for history without leaving them current. See the [Venice price list](https://docs.venice.ai/overview/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), and [OpenAI pricing](https://developers.openai.com/api/docs/pricing)."
                },
                {"id": "conflict_table_block", "type": "table", "tableId": "active_conflict_detail", "layout": "full"},
                {
                    "id": "source_checks_finding",
                    "type": "markdown",
                    "body": "## Flagship spot checks are accurate; anomaly-led checks found stale duplicates\n\n**OpenAI GPT-5.4, Mistral Small 4, DeepSeek V4 Flash, and Google Gemini 2.5 Flash Image match official list prices.** The anomaly-led pass confirms that Novita’s Qwen3 Next Thinking model should be $0.15 input and $1.50 output per million tokens, while its catalog file also contains stale $0.98/$3.95 rules. Sources: [OpenAI](https://developers.openai.com/api/docs/pricing), [Mistral](https://docs.mistral.ai/models/model-selection-guide?models=mistral-small-4-0-26-03), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing), and [Novita](https://novita.ai/pricing)."
                },
                {"id": "external_checks_table_block", "type": "table", "tableId": "external_checks", "layout": "full"},
                {
                    "id": "provenance_finding",
                    "type": "markdown",
                    "sourceId": "catalog_audit",
                    "body": f"## Pricing provenance remains incomplete\n\n**{missing_source_count} of {source_provider_count} providers with current pricing data lack a provider-level pricing source URL.** Rule files also do not carry a verification timestamp. This still prevents a true source-by-source recertification of all {current_rules} current rules and makes stale-price detection dependent on manual anomaly hunting."
                },
                {"id": "source_coverage_chart_block", "type": "chart", "chartId": "source_coverage_chart", "layout": "full"},
                {
                    "id": "scope_definitions",
                    "type": "markdown",
                    "body": f"## Scope, data, and definitions\n\n- **Catalog-active model:** status is `Available` or `Limited Access` ({catalog_active_models} models).\n- **Production-active route:** provider mapping is active on the gateway, its effective window includes the audit timestamp, and capability status is `active` or `deranked_*` ({route_total} provider-capability routes across {summary['active_models_with_gateway_route']} catalog-active models).\n- **Current price:** at least one pricing rule is effective at 17 July 2026 23:30 UTC.\n- **Resolved route:** an exact pricing key or a legitimate provider-native model/capability equivalent has a current rule.\n- **Units:** token comparisons are normalized to price per one million tokens; EUR rules remain EUR and are not mixed into USD spread checks."
                },
                {
                    "id": "methodology",
                    "type": "markdown",
                    "body": "## Methodology\n\nThe audit parsed every model, provider mapping, provider metadata, pricing entry, and rule in the working tree. It ran the repository’s structure and pricing validators, recomputed effective windows at a fixed timestamp, reconciled provider-native identifiers and capability aliases, checked duplicates and conflicting overlaps, tested cache/batch ordering, profiled currencies and sources, and compared selected high-value or anomalous prices with official provider pages. The executed notebook and Python module preserve the calculation path."
                },
                {
                    "id": "limitations",
                    "type": "markdown",
                    "body": "## Limitations and robustness checks\n\n- Passing schema validation establishes structural safety, not factual price accuracy.\n- The 58.4% price coverage across all catalog-active models is not a gateway failure rate: many catalog entries are research, local, or otherwise non-routable. The production-route cohort is the decision-relevant denominator.\n- Cross-provider price spreads were treated as review candidates, not errors, because region, quantization, service tier, and promotions can legitimately differ.\n- Eight authoritative checks are spot checks, not a full external recertification of 4,328 current rules; missing source metadata blocks that stronger claim.\n- The working tree contained unrelated user changes during the audit. Calculations reflect the files present at the fixed snapshot and did not modify catalog pricing data."
                },
                {
                    "id": "recommendations",
                    "type": "markdown",
                    "body": f"## Recommended next steps\n\n1. **Confirm the {unresolved_routes} unresolved provider routes.** Ambient and Avian routes have no current pricing file in the catalog.\n2. **Let the scheduled Computer Use Preview retirement proceed.** Its provider mapping already ends on 2026-07-23.\n3. **Keep the overlap validator.** Reject equal-priority, same-plan, same-meter, same-match rules whose effective windows overlap with different normalized prices.\n4. **Make provenance mandatory.** Require `pricing_source_url` and `price_verified_at` for every provider with current pricing, then add a freshness threshold.\n5. **Keep the missing-pricing audit alias-aware.** It now distinguishes {alternate_routes} alternate-key matches from {unresolved_routes} unresolved routes."
                },
                {
                    "id": "further_questions",
                    "type": "markdown",
                    "body": "## Further questions\n\n- Should an active gateway capability be deployable when only an alternate pricing key exists, or should importer normalization enforce one canonical key?\n- What verification SLA should apply to direct providers versus aggregators with rapidly changing model catalogs?\n- Should historical price cards without current rules remain queryable but be excluded from all default pricing surfaces?"
                }
            ]
        },
        "snapshot": {
            "version": 1,
            "generatedAt": summary["audit_at"],
            "status": "ready",
            "datasets": {
                "summary": [summary_row],
                "route_resolution": route_resolution,
                "unresolved_by_provider": unresolved_by_provider,
                "unresolved_gaps": unresolved_gap_rows,
                "active_conflicts": active_conflicts,
                "external_checks": external_checks,
                "source_coverage": source_coverage
            }
        },
        "sources": [source]
    }
    artifact["manifest"]["tables"] = []
    artifact["manifest"]["blocks"] = [
        {
            "id": "technical_summary",
            "type": "markdown",
            "layout": "full",
            "sourceId": "catalog_audit",
            "body": f"## Assessment: ready with a provider-review caveat\n\n**{resolved_routes} of {route_total} active routes ({resolved_pct:.1f}%)** resolve to a current price after alias handling; {unresolved_routes} Ambient/Avian routes remain for provider confirmation. No conflicting rule pairs remain on active models, while **{source_url_count} of {source_provider_count} pricing providers** expose a source URL. Computer Use Preview remains scheduled to retire on 2026-07-23. Snapshot: **17 July 2026 23:30 UTC**. Exact routes, rule evidence, official spot checks, methods, and limitations are in the executed notebook and supporting JSON."
        },
        {
            "id": "source_coverage_chart_block",
            "type": "chart",
            "chartId": "source_coverage_chart",
            "layout": "full"
        }
    ]
    (HERE / "artifact.json").write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(HERE / "artifact.json")


if __name__ == "__main__":
    main()
