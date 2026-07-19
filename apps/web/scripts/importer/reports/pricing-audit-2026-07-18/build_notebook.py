from __future__ import annotations

from pathlib import Path

import nbformat as nbf


HERE = Path(__file__).resolve().parent
NOTEBOOK_PATH = HERE / "pricing-audit.ipynb"


def main() -> None:
    notebook = nbf.v4.new_notebook()
    notebook["metadata"] = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3"},
    }
    notebook["cells"] = [
        nbf.v4.new_markdown_cell(
            "# Active-model pricing audit\n\n"
            "## tl;dr\n\n"
            "This notebook executes the repository-wide pricing audit used by the accompanying technical report. "
            "The conclusions are populated from executed outputs below; the HTML report is the reader-facing synthesis."
        ),
        nbf.v4.new_markdown_cell(
            "## Context & Methods\n\n"
            "The audit uses two complementary definitions as of **18 July 2026 BST / 17 July 2026 23:30 UTC**:\n\n"
            "- **Catalog-active model:** `status` is `Available` or `Limited Access`.\n"
            "- **Production-active route:** a provider-model mapping has `is_active_gateway = true`, its effective window is open, "
            "and its capability status is `active` or `deranked_*`.\n\n"
            "### Key Assumptions\n\n"
            "Pricing coverage means at least one rule is effective at the audit timestamp. Historical and future rules are retained "
            "but do not satisfy current coverage. Provider price spreads are anomaly candidates, not automatic errors, because region, "
            "quantization, service tier, and promotional terms can legitimately differ."
        ),
        nbf.v4.new_code_cell(
            "from pathlib import Path\n"
            "import json\n"
            "import sys\n\n"
            "current = Path.cwd().resolve()\n"
            "repo_root = next(candidate for candidate in [current, *current.parents] if (candidate / 'packages/data/catalog/src/data').exists())\n"
            "audit_dir = repo_root / 'apps/web/scripts/importer/reports/pricing-audit-2026-07-18'\n"
            "sys.path.insert(0, str(audit_dir))\n"
            "from pricing_audit import build_audit, write_outputs\n\n"
            "audit = build_audit(repo_root)\n"
            "write_outputs(audit, repo_root)\n"
            "audit['summary']"
        ),
        nbf.v4.new_markdown_cell("## Data\n\n### 1. Coverage classes for catalog-active models"),
        nbf.v4.new_code_cell("audit['coverage_classes']"),
        nbf.v4.new_markdown_cell("### 2. Active provider capability gaps"),
        nbf.v4.new_code_cell(
            "{\n"
            "    'gap_count': len(audit['route_gaps']),\n"
            "    'by_provider': audit['gap_by_provider'],\n"
            "    'sample': audit['route_gaps'][:10],\n"
            "}"
        ),
        nbf.v4.new_markdown_cell("## Results\n\n### 3. Provider coverage and provenance"),
        nbf.v4.new_code_cell(
            "sorted(\n"
            "    audit['provider_coverage'],\n"
            "    key=lambda row: (-row['missing_active_route_count'], -row['active_route_count'], row['provider_id'])\n"
            ")[:20]"
        ),
        nbf.v4.new_markdown_cell("### 4. Rule-level anomaly checks"),
        nbf.v4.new_code_cell(
            "{\n"
            "    'duplicate_keys': audit['duplicate_pricing_keys'],\n"
            "    'conflicting_overlaps': audit['overlapping_rules'][:20],\n"
            "    'cached_read_more_expensive': audit['cached_read_anomalies'][:20],\n"
            "    'batch_more_expensive': audit['batch_anomalies'][:20],\n"
            "    'top_cross_provider_spreads': audit['top_cross_provider_spreads'][:20],\n"
            "}"
        ),
        nbf.v4.new_markdown_cell(
            "## Takeaways\n\n"
            "The executed summary and detail outputs above are the canonical calculation record. Interpretive prioritization, "
            "external-source spot checks, limitations, and recommended remediation are documented in the accompanying HTML report."
        ),
    ]
    nbf.write(notebook, NOTEBOOK_PATH)
    print(NOTEBOOK_PATH)


if __name__ == "__main__":
    main()
