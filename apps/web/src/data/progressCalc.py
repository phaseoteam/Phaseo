import json
import os
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Set, Any, Tuple
from datetime import datetime
from tabulate import tabulate
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns

# Import slug function from utils
def slug(s: str) -> str:
    """Simple slug function to normalize strings."""
    return s.lower().replace(' ', '-').replace('/', '-').replace('_', '-')

# Path to the JSON export directory
JSON_EXPORT_PATH = Path(".")

# Expected organisation link platforms
EXPECTED_ORG_PLATFORMS = {
    "discord", "github", "hugging_face", "instagram", "tiktok", 
    "website", "x", "youtube", "linkedin", "reddit", "threads"
}

# Expected model links
EXPECTED_MODEL_LINKS = {"api_reference", "playground", "paper", "announcement", "weights"}

# Expected model basic details (metadata fields)
EXPECTED_MODEL_BASIC_DETAILS = {
    "status", "previous_model_id", "model_family_id", "announced_date", 
    "release_date", "deprecation_date", "retirement_date", "license", 
    "input_types", "output_types"
}

# Expected model technical details
EXPECTED_MODEL_DETAILS = {"input_context_length", "output_context_length", "knowledge_cutoff"}

# Additional details for non-proprietary models
NON_PROPRIETARY_DETAILS = {"parameter_count", "training_tokens"}

def load_json_file(filepath: Path) -> Dict[str, Any]:
    """Load a JSON file safely."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def get_expected_model_fields(status: str) -> Dict[str, Set[str]]:
    """Get expected fields for a model based on its status."""
    status = (status or "").lower()
    
    # Base fields that are always expected (but might not be in the JSON)
    base_fields = {"status"}  # Status itself is always expected
    
    # Basic metadata fields
    basic_metadata = {"model_id", "organisation_id"}
    
    # Date fields
    date_fields = {"announced_date", "release_date", "deprecation_date", "retirement_date"}
    
    # Other fields
    other_fields = {"license", "input_types", "output_types"}
    
    # Links and technical details are expected for most statuses
    links_expected = set(EXPECTED_MODEL_LINKS)
    technical_details = set(EXPECTED_MODEL_DETAILS)
    non_proprietary_details = set(NON_PROPRIETARY_DETAILS)
    
    if status == "rumoured":
        # For rumoured models, only expect basic id, name, and status
        expected_basic = {"status", "model_id", "name"}
        expected_links = set()
        expected_technical = set()
        expected_non_prop = set()
        alias_expected = False
        family_expected = False
        
    elif status == "announced":
        # Announced models should have announced_date and basic info
        expected_basic = base_fields | basic_metadata | {"announced_date"} | other_fields - {"release_date", "deprecation_date", "retirement_date"}
        expected_links = links_expected  # Links might be available
        expected_technical = technical_details  # Technical details might be available
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
        
    elif status == "released":
        # Released models should have release_date and most fields
        expected_basic = base_fields | basic_metadata | {"announced_date", "release_date"} | other_fields - {"deprecation_date", "retirement_date"}
        expected_links = links_expected
        expected_technical = technical_details
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
        
    elif status == "updated":
        # Updated models are like released but might have updates
        expected_basic = base_fields | basic_metadata | date_fields | other_fields
        expected_links = links_expected
        expected_technical = technical_details
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
        
    elif status == "deprecated":
        # Deprecated models should have deprecation_date
        expected_basic = base_fields | basic_metadata | date_fields | other_fields
        expected_links = links_expected
        expected_technical = technical_details
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
        
    elif status == "retired":
        # Retired models should have retirement_date
        expected_basic = base_fields | basic_metadata | date_fields | other_fields
        expected_links = links_expected
        expected_technical = technical_details
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
        
    else:
        # Unknown status - expect everything
        expected_basic = base_fields | basic_metadata | date_fields | other_fields
        expected_links = links_expected
        expected_technical = technical_details
        expected_non_prop = non_proprietary_details
        alias_expected = True
        family_expected = True
    
    return {
        "basic": expected_basic,
        "links": expected_links,
        "technical": expected_technical,
        "non_proprietary": expected_non_prop,
        "alias_expected": alias_expected,
        "family_expected": family_expected
    }


def get_all_organisations() -> List[str]:
    """Get list of all organisation IDs."""
    manifest = load_json_file(JSON_EXPORT_PATH / "manifest.json")
    return manifest.get("organisations", [])

def get_all_models() -> Dict[str, List[str]]:
    """Get dict of org_id -> list of model_ids."""
    manifest = load_json_file(JSON_EXPORT_PATH / "manifest.json")
    return manifest.get("models", {})

def get_all_benchmarks() -> List[str]:
    """Get list of all benchmark IDs."""
    manifest = load_json_file(JSON_EXPORT_PATH / "manifest.json")
    return manifest.get("benchmarks", [])

def get_all_api_providers() -> List[str]:
    """Get list of all API provider IDs."""
    manifest = load_json_file(JSON_EXPORT_PATH / "manifest.json")
    return manifest.get("api_providers", [])

def get_all_subscription_plans() -> List[str]:
    """Get list of all subscription plan IDs."""
    manifest = load_json_file(JSON_EXPORT_PATH / "manifest.json")
    return manifest.get("subscription_plans", [])

def calculate_organisation_completion() -> Dict[str, float]:
    """Calculate completion % for organisations."""
    orgs = get_all_organisations()
    completions = {}
    
    for org_id in orgs:
        org_path = JSON_EXPORT_PATH / "organisations" / org_id / "organisation.json"
        org_data = load_json_file(org_path)
        
        if not org_data:
            completions[org_id] = 0.0
            continue
        
        # Check basic fields
        basic_fields = ["organisation_id", "name", "country_code", "description", "colour"]
        basic_score = sum(1 for field in basic_fields if org_data.get(field))
        
        # Check links
        links = org_data.get("organisation_links", [])
        present_platforms = {link.get("platform") for link in links if link.get("platform")}
        link_score = len(present_platforms & EXPECTED_ORG_PLATFORMS)
        
        # Total possible: basic fields (5) + expected platforms (11)
        total_possible = 5 + 11
        actual_score = basic_score + link_score
        
        completions[org_id] = (actual_score / total_possible) * 100 if total_possible > 0 else 0.0
    
    return completions

def calculate_model_completion() -> Dict[str, float]:
    """Calculate completion % for models."""
    models_by_org = get_all_models()
    completions = {}
    
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
            model_path = JSON_EXPORT_PATH / "models" / org_id / short_model_id / "model.json"
            model_data = load_json_file(model_path)
            
            if not model_data:
                completions[model_id] = 0.0
                continue
            
            scores = []
            
            # Get status and determine expected fields
            status = model_data.get("status", "")
            expected_fields = get_expected_model_fields(status)
            
            alias_expected = expected_fields.get("alias_expected", True)
            family_expected = expected_fields.get("family_expected", True)
            
            # Basic details (metadata) - only count expected fields
            expected_basic = expected_fields["basic"]
            basic_detail_score = sum(1 for field in expected_basic if model_data.get(field) is not None)
            scores.append(basic_detail_score / len(expected_basic)) if expected_basic else scores.append(1.0)
            
            # Links - only count expected links
            expected_links = expected_fields["links"]
            if expected_links:
                links = model_data.get("links", [])
                present_links = {link.get("platform") for link in links if link.get("platform")}
                present_expected = present_links & expected_links
                link_score = len(present_expected)
                scores.append(link_score / len(expected_links))
            else:
                scores.append(1.0)  # No links expected
            
            # Technical details - only count expected details
            expected_technical = expected_fields["technical"]
            if expected_technical:
                details = model_data.get("details", [])
                present_details = {detail.get("name") for detail in details if detail.get("name")}
                present_expected_details = present_details & expected_technical
                detail_score = len(present_expected_details)
                scores.append(detail_score / len(expected_technical))
            else:
                scores.append(1.0)  # No technical details expected
            
            # Additional details for non-proprietary - only if expected
            expected_non_prop = expected_fields["non_proprietary"]
            license_val = (model_data.get("license") or "").lower()
            if "proprietary" not in license_val and expected_non_prop:
                present_details = {detail.get("name") for detail in model_data.get("details", []) if detail.get("name")}
                non_prop_score = len(present_details & expected_non_prop)
                scores.append(non_prop_score / len(expected_non_prop))
            else:
                scores.append(1.0)  # Full score if proprietary or not expected
            
            # Has alias (check if any alias file references this model_id)
            has_alias_found = False
            if alias_expected:
                alias_file_id = model_data.get("model_id", model_id)
                aliases_path = JSON_EXPORT_PATH / "aliases"
                if aliases_path.exists():
                    for alias_dir in aliases_path.iterdir():
                        if alias_dir.is_dir():
                            alias_file = alias_dir / "alias.json"
                            if alias_file.exists():
                                alias_data = load_json_file(alias_file)
                                if alias_data.get("resolved_model_id") == alias_file_id:
                                    has_alias_found = True
                                    break
            has_alias = 1.0 if not alias_expected else (1.0 if has_alias_found else 0.0)
            scores.append(has_alias)
            
            # Part of family
            has_family = 1.0 if not family_expected else (1.0 if model_data.get("model_family_id") else 0.0)
            scores.append(has_family)
            
            # Average the scores
            completion = sum(scores) / len(scores) * 100
            completions[model_id] = completion
    
    return completions

def calculate_benchmark_completion() -> float:
    """Calculate completion % for benchmarks."""
    benchmarks = get_all_benchmarks()
    if not benchmarks:
        return 0.0
    
    scores = []
    for bench_id in benchmarks:
        bench_path = JSON_EXPORT_PATH / "benchmarks" / bench_id / "benchmark.json"
        bench_data = load_json_file(bench_path)
        
        if not bench_data:
            scores.append(0.0)
            continue
        
        fields = ["benchmark_id", "benchmark_name", "category", "ascending_order", "link"]
        field_score = sum(1 for field in fields if bench_data.get(field) is not None)
        scores.append(field_score / len(fields))
    
    return (sum(scores) / len(scores)) * 100 if scores else 0.0

def calculate_api_provider_completion() -> float:
    """Calculate completion % for API providers."""
    providers = get_all_api_providers()
    if not providers:
        return 0.0
    
    scores = []
    for prov_id in providers:
        prov_path = JSON_EXPORT_PATH / "api_providers" / prov_id / "api_provider.json"
        prov_data = load_json_file(prov_path)
        
        if not prov_data:
            scores.append(0.0)
            continue
        
        fields = ["api_provider_id", "api_provider_name", "description", "link", "country_code"]
        field_score = sum(1 for field in fields if prov_data.get(field) is not None)
        scores.append(field_score / len(fields))
    
    return (sum(scores) / len(scores)) * 100 if scores else 0.0

def get_api_provider_model_counts() -> Dict[str, int]:
    """Count models per provider from the pricing directory."""
    provider_model_counts = defaultdict(int)
    
    pricing_path = JSON_EXPORT_PATH / "pricing"
    if not pricing_path.exists():
        return {}
    
    for provider_dir in pricing_path.iterdir():
        if not provider_dir.is_dir():
            continue
        provider_slug = provider_dir.name
        
        for endpoint_dir in provider_dir.iterdir():
            if not endpoint_dir.is_dir():
                continue
            for model_dir in endpoint_dir.iterdir():
                if model_dir.is_dir():
                    provider_model_counts[provider_slug] += 1
    
    return dict(provider_model_counts)


def get_api_provider_completion_details() -> Dict[str, Dict[str, Any]]:
    """Get detailed completion info for API providers."""
    providers = get_all_api_providers()
    provider_model_counts = get_api_provider_model_counts()
    details = {}
    
    for prov_id in providers:
        prov_path = JSON_EXPORT_PATH / "api_providers" / prov_id / "api_provider.json"
        prov_data = load_json_file(prov_path)
        
        if not prov_data:
            details[prov_id] = {
                "completion": 0.0,
                "basic_fields": "❌ No data",
                "models_count": 0,
                "active_gateway_models": 0,
                "description": "No data"
            }
            continue
        
        basic_fields = ["provider_id", "name", "description", "link", "country_code"]
        present_basic = [f for f in basic_fields if prov_data.get(f)]
        basic_score = len(present_basic)
        basic_status = f"✅ {basic_score}/{len(basic_fields)}" if present_basic else "❌ No data"
        
        # Get model count from pricing directory
        models_count = provider_model_counts.get(prov_id, 0)
        
        # Active gateway models
        active_gateway_count = 0
        pricing_path = JSON_EXPORT_PATH / "pricing" / prov_id
        if pricing_path.exists():
            for endpoint_dir in pricing_path.iterdir():
                if not endpoint_dir.is_dir():
                    continue
                for model_dir in endpoint_dir.iterdir():
                    if not model_dir.is_dir():
                        continue
                    pricing_file = model_dir / "pricing.json"
                    if pricing_file.exists():
                        pricing_data = load_json_file(pricing_file)
                        if pricing_data.get("is_active_gateway"):
                            active_gateway_count += 1
        
        completion = (basic_score / len(basic_fields)) * 100
        
        details[prov_id] = {
            "completion": completion,
            "basic_fields": basic_status,
            "models_count": models_count,
            "active_gateway_models": active_gateway_count,
            "description": "✅" if prov_data.get("description") else "❌"
        }
    
    return details


def get_benchmark_model_count() -> Dict[str, int]:
    """Get count of unique models that have scores for each benchmark."""
    models_by_org = get_all_models()
    benchmark_counts = defaultdict(int)
    
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
            model_path = JSON_EXPORT_PATH / "models" / org_id / short_model_id / "model.json"
            model_data = load_json_file(model_path)
            
            if not model_data:
                continue
            
            benchmarks = model_data.get("benchmarks", [])
            for bench in benchmarks:
                benchmark_id = bench.get("benchmark_id") if isinstance(bench, dict) else bench
                if benchmark_id:
                    benchmark_counts[benchmark_id] += 1
    
    return dict(benchmark_counts)


def get_subscription_plan_completion_details() -> Dict[str, Dict[str, Any]]:
    """Get detailed completion info for subscription plans."""
    plans = get_all_subscription_plans()
    details = {}
    
    for plan_id in plans:
        plan_path = JSON_EXPORT_PATH / "subscription_plans" / plan_id / "plan.json"
        plan_data = load_json_file(plan_path)
        
        if not plan_data:
            details[plan_id] = {
                "completion": 0.0,
                "basic_fields": "❌ No data",
                "models_count": 0,
                "description": "No data"
            }
            continue
        
        # Basic fields
        basic_fields = ["plan_id", "name", "provider_id", "description", "frequency", "usd_price", "link"]
        present_basic = [f for f in basic_fields if plan_data.get(f) is not None]
        basic_score = len(present_basic)
        basic_status = f"✅ {basic_score}/{len(basic_fields)}" if present_basic else "❌ No data"
        
        # Models count
        models = plan_data.get("models", [])
        models_count = len(models)
        
        # Completion calculation
        completion = (basic_score / len(basic_fields)) * 100
        
        details[plan_id] = {
            "completion": completion,
            "basic_fields": basic_status,
            "models_count": models_count,
            "description": "✅" if plan_data.get("description") else "❌"
        }
    
    return details

def calculate_model_benchmark_coverage() -> float:
    """Calculate how many models have at least 5 benchmarks."""
    models_by_org = get_all_models()
    total_models = sum(len(models) for models in models_by_org.values())
    if total_models == 0:
        return 0.0
    
    models_with_5_benchmarks = 0
    
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
            model_path = JSON_EXPORT_PATH / "models" / org_id / short_model_id / "model.json"
            model_data = load_json_file(model_path)
            benchmarks = model_data.get("benchmarks", [])
            if len(benchmarks) >= 5:
                models_with_5_benchmarks += 1
    
    return (models_with_5_benchmarks / total_models) * 100

def calculate_model_api_coverage() -> float:
    """Calculate how many models have at least one API provider (based on pricing data)."""
    models_by_org = get_all_models()
    total_models = sum(len(models) for models in models_by_org.values())
    if total_models == 0:
        return 0.0
    
    # Build set of models that have pricing data (indicating API provider support)
    models_with_pricing = set()
    pricing_path = JSON_EXPORT_PATH / "pricing"
    
    if pricing_path.exists():
        # Scan through all pricing directories: pricing/provider/endpoint/model/
        for provider_dir in pricing_path.iterdir():
            if not provider_dir.is_dir():
                continue
            for endpoint_dir in provider_dir.iterdir():
                if not endpoint_dir.is_dir():
                    continue
                for model_dir in endpoint_dir.iterdir():
                    if model_dir.is_dir():
                        models_with_pricing.add(model_dir.name)
    
    models_with_api = 0
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            if slug(model_id) in models_with_pricing:
                models_with_api += 1
    
    return (models_with_api / total_models) * 100

def calculate_model_pricing_coverage() -> float:
    """Calculate how many models have pricing data."""
    models_by_org = get_all_models()
    total_models = sum(len(models) for models in models_by_org.values())
    if total_models == 0:
        return 0.0
    
    models_with_pricing = 0
    
    # Check pricing directories
    pricing_providers = set()
    pricing_path = JSON_EXPORT_PATH / "pricing"
    if pricing_path.exists():
        pricing_providers = set(d.name for d in pricing_path.iterdir() if d.is_dir())
    
    # For each provider, check models with pricing
    models_with_pricing_set = set()
    for prov_id in pricing_providers:
        prov_pricing_path = pricing_path / prov_id
        if not prov_pricing_path.exists():
            continue
        
        for endpoint_dir in prov_pricing_path.iterdir():
            if not endpoint_dir.is_dir():
                continue
            for model_dir in endpoint_dir.iterdir():
                if model_dir.is_dir():
                    models_with_pricing_set.add(model_dir.name)
    
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            if slug(model_id) in models_with_pricing_set:
                models_with_pricing += 1
    
    return (models_with_pricing / total_models) * 100

def calculate_subscription_plan_completion() -> float:
    """Calculate completion % for subscription plans."""
    plans = get_all_subscription_plans()
    if not plans:
        return 0.0
    
    scores = []
    for plan_id in plans:
        plan_path = JSON_EXPORT_PATH / "subscription_plans" / plan_id / "plan.json"
        plan_data = load_json_file(plan_path)
        
        if not plan_data:
            scores.append(0.0)
            continue
        
        fields = ["plan_id", "name", "provider_id", "description", "frequency", "usd_price", "link"]
        field_score = sum(1 for field in fields if plan_data.get(field) is not None)
        scores.append(field_score / len(fields))
    
    return (sum(scores) / len(scores)) * 100 if scores else 0.0


def compute_field_totals() -> Tuple[int, int]:
    """Compute total possible fields and completed fields across main categories.

    Returns:
        (completed_count, total_possible_count)
    """
    total_possible = 0
    total_completed = 0

    # Organisations
    orgs = get_all_organisations()
    org_basic_fields = ["organisation_id", "name", "country_code", "description", "colour"]
    for org_id in orgs:
        total_possible += len(org_basic_fields) + len(EXPECTED_ORG_PLATFORMS)
        org_path = JSON_EXPORT_PATH / "organisations" / org_id / "organisation.json"
        org_data = load_json_file(org_path)
        if not org_data:
            continue
        total_completed += sum(1 for f in org_basic_fields if org_data.get(f))
        present_platforms = {link.get("platform") for link in org_data.get("organisation_links", []) if link.get("platform")}
        total_completed += len(present_platforms & EXPECTED_ORG_PLATFORMS)

    # Models
    models_by_org = get_all_models()
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
            model_path = JSON_EXPORT_PATH / "models" / org_id / short_model_id / "model.json"
            model_data = load_json_file(model_path)

            # Determine expected fields based on status (empty status -> expect everything)
            status = model_data.get("status", "") if model_data else ""
            expected = get_expected_model_fields(status)

            expected_basic = expected["basic"]
            expected_links = expected["links"]
            expected_technical = expected["technical"]
            expected_non_prop = expected["non_proprietary"]

            # Alias and family are expected based on status
            expected_alias = 1 if expected.get("alias_expected", True) else 0
            expected_family = 1 if expected.get("family_expected", True) else 0

            # If license is proprietary, non-proprietary fields are not expected
            license_val = (model_data.get("license") or "").lower() if model_data else ""
            is_proprietary = "proprietary" in license_val
            expected_non_count = 0 if is_proprietary else len(expected_non_prop)

            model_expected = len(expected_basic) + len(expected_links) + len(expected_technical) + expected_non_count + expected_alias + expected_family
            total_possible += model_expected

            if not model_data:
                continue

            # Completed counts
            total_completed += sum(1 for f in expected_basic if model_data.get(f) is not None)

            present_links = {link.get("platform") for link in model_data.get("links", []) if link.get("platform")}
            total_completed += len(present_links & expected_links)

            present_details = {detail.get("name") for detail in model_data.get("details", []) if detail.get("name")}
            total_completed += len(present_details & expected_technical)

            if not is_proprietary:
                total_completed += len(present_details & expected_non_prop)

            aliases_path = JSON_EXPORT_PATH / "aliases"
            alias_file_id = model_data.get("id", model_id)
            if aliases_path.exists() and (aliases_path / f"{alias_file_id}.json").exists():
                total_completed += expected_alias

            if expected.get("family_expected", True) and model_data.get("model_family_id"):
                total_completed += 1

    # Benchmarks
    benchmarks = get_all_benchmarks()
    bench_fields = ["benchmark_id", "benchmark_name", "category", "ascending_order", "link"]
    total_possible += len(benchmarks) * len(bench_fields)
    for bench_id in benchmarks:
        bench_path = JSON_EXPORT_PATH / "benchmarks" / bench_id / "benchmark.json"
        bench_data = load_json_file(bench_path)
        if not bench_data:
            continue
        total_completed += sum(1 for f in bench_fields if bench_data.get(f) is not None)

    # API providers
    providers = get_all_api_providers()
    api_fields = ["provider_id", "name", "description", "link", "country_code"]
    total_possible += len(providers) * len(api_fields)
    for prov_id in providers:
        prov_path = JSON_EXPORT_PATH / "api_providers" / prov_id / "api_provider.json"
        prov_data = load_json_file(prov_path)
        if not prov_data:
            continue
        total_completed += sum(1 for f in api_fields if prov_data.get(f) is not None)

    # Subscription plans
    plans = get_all_subscription_plans()
    plan_fields = ["plan_id", "name", "provider_id", "description", "frequency", "usd_price", "link"]
    total_possible += len(plans) * len(plan_fields)
    for plan_id in plans:
        plan_path = JSON_EXPORT_PATH / "subscription_plans" / plan_id / "plan.json"
        plan_data = load_json_file(plan_path)
        if not plan_data:
            continue
        total_completed += sum(1 for f in plan_fields if plan_data.get(f) is not None)

    return total_completed, total_possible

def print_dashboard():
    """Print the completion dashboard with detailed breakdowns."""
    console = Console()
    # Ensure JSON data is up-to-date by running XLSX -> JSON conversion first
    # run_xlsx_conversion(console)  # Removed as per user request
    
    # Header
    header = Panel.fit(
        "[bold blue]AI Stats Data Completion Dashboard[/bold blue]\n"
        "[dim]Detailed analysis of data completeness across all categories[/dim]",
        border_style="blue"
    )
    console.print(header)
    console.print()
    
    # Calculate all metrics
    org_completions = calculate_organisation_completion()
    avg_org_completion = sum(org_completions.values()) / len(org_completions) if org_completions else 0.0
    
    model_completions = calculate_model_completion()
    avg_model_completion = sum(model_completions.values()) / len(model_completions) if model_completions else 0.0
    
    bench_completion = calculate_benchmark_completion()
    bench_coverage = calculate_model_benchmark_coverage()
    
    api_completion = calculate_api_provider_completion()
    api_coverage = calculate_model_api_coverage()
    
    pricing_coverage = calculate_model_pricing_coverage()
    
    sub_completion = calculate_subscription_plan_completion()
    
    # Compute field totals for display
    total_completed_fields, total_possible_fields = compute_field_totals()
    
    # Overall completion (based on total fields completed vs total possible fields)
    overall_completion = (total_completed_fields / total_possible_fields) * 100 if total_possible_fields > 0 else 0.0
    
    # Create model to org mapping for table display
    models_by_org = get_all_models()
    model_to_org = {model_id: org_id for org_id, model_ids in models_by_org.items() for model_id in model_ids}
    
    # Compute per-category field totals
    # Organizations
    orgs = get_all_organisations()
    org_basic_fields = ["organisation_id", "name", "country_code", "description", "colour"]
    org_total_possible = len(orgs) * (len(org_basic_fields) + len(EXPECTED_ORG_PLATFORMS))
    org_total_completed = 0
    for org_id in orgs:
        org_path = JSON_EXPORT_PATH / "organisations" / org_id / "organisation.json"
        org_data = load_json_file(org_path)
        if not org_data:
            continue
        org_total_completed += sum(1 for f in org_basic_fields if org_data.get(f))
        present_platforms = {link.get("platform") for link in org_data.get("organisation_links", []) if link.get("platform")}
        org_total_completed += len(present_platforms & EXPECTED_ORG_PLATFORMS)
    
    # Models
    models_by_org = get_all_models()
    model_total_possible = 0
    model_total_completed = 0
    for org_id, model_ids in models_by_org.items():
        for model_id in model_ids:
            short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
            model_path = JSON_EXPORT_PATH / "models" / org_id / short_model_id / "model.json"
            model_data = load_json_file(model_path)
            status = model_data.get("status", "") if model_data else ""
            expected = get_expected_model_fields(status)
            expected_basic = expected["basic"]
            expected_links = expected["links"]
            expected_technical = expected["technical"]
            expected_non_prop = expected["non_proprietary"]
            license_val = (model_data.get("license") or "").lower() if model_data else ""
            is_proprietary = "proprietary" in license_val
            expected_non_count = 0 if is_proprietary else len(expected_non_prop)
            model_expected = len(expected_basic) + len(expected_links) + len(expected_technical) + expected_non_count + 1 + 1  # alias + family
            model_total_possible += model_expected
            if not model_data:
                continue
            model_total_completed += sum(1 for f in expected_basic if model_data.get(f) is not None)
            present_links = {link.get("platform") for link in model_data.get("links", []) if link.get("platform")}
            model_total_completed += len(present_links & expected_links)
            present_details = {detail.get("name") for detail in model_data.get("details", []) if detail.get("name")}
            model_total_completed += len(present_details & expected_technical)
            if not is_proprietary:
                model_total_completed += len(present_details & expected_non_prop)
            aliases_path = JSON_EXPORT_PATH / "aliases"
            alias_file_id = model_data.get("id", model_id)
            if aliases_path.exists() and (aliases_path / f"{alias_file_id}.json").exists():
                model_total_completed += 1
            if model_data.get("model_family_id"):
                model_total_completed += 1
    
    # Benchmarks
    benchmarks = get_all_benchmarks()
    bench_fields = ["benchmark_id", "benchmark_name", "category", "ascending_order", "link"]
    bench_total_possible = len(benchmarks) * len(bench_fields)
    bench_total_completed = 0
    for bench_id in benchmarks:
        bench_path = JSON_EXPORT_PATH / "benchmarks" / bench_id / "benchmark.json"
        bench_data = load_json_file(bench_path)
        if not bench_data:
            continue
        bench_total_completed += sum(1 for f in bench_fields if bench_data.get(f) is not None)
    
    # API providers
    providers = get_all_api_providers()
    api_fields = ["provider_id", "name", "description", "link", "country_code"]
    api_total_possible = len(providers) * len(api_fields)
    api_total_completed = 0
    for prov_id in providers:
        prov_path = JSON_EXPORT_PATH / "api_providers" / prov_id / "api_provider.json"
        prov_data = load_json_file(prov_path)
        if not prov_data:
            continue
        api_total_completed += sum(1 for f in api_fields if prov_data.get(f) is not None)
    
    # Subscription plans
    plans = get_all_subscription_plans()
    plan_fields = ["plan_id", "name", "provider_id", "description", "frequency", "usd_price", "link"]
    sub_total_possible = len(plans) * len(plan_fields)
    sub_total_completed = 0
    for plan_id in plans:
        plan_path = JSON_EXPORT_PATH / "subscription_plans" / plan_id / "plan.json"
        plan_data = load_json_file(plan_path)
        if not plan_data:
            continue
        sub_total_completed += sum(1 for f in plan_fields if plan_data.get(f) is not None)
    
    # Overall stats
    stats_table = Table(title="📊 Overall Statistics", show_header=True, header_style="bold magenta")
    stats_table.add_column("Metric", style="cyan")
    stats_table.add_column("Value", style="yellow", justify="right")
    
    stats_table.add_row("Overall Completion", f"{overall_completion:.1f}% ({total_completed_fields}/{total_possible_fields})")
    stats_table.add_row("Total Organizations", str(len(org_completions)))
    stats_table.add_row("Total Models", str(len(model_completions)))
    stats_table.add_row("Total Benchmarks", str(len(get_all_benchmarks())))
    stats_table.add_row("Total API Providers", str(len(get_all_api_providers())))
    stats_table.add_row("Total Subscription Plans", str(len(get_all_subscription_plans())))
    
    console.print(stats_table)
    console.print()
    
    # Progress bars function
    def progress_bar(percentage, width=40):
        filled = int(width * percentage / 100)
        bar = "█" * filled + "░" * (width - filled)
        color = "green" if percentage >= 80 else "yellow" if percentage >= 50 else "red"
        return f"[{color}]{bar}[/{color}] {percentage:.1f}%"
    
    # Category overview
    overview_table = Table(title="📈 Category Overview", show_header=True, header_style="bold green")
    overview_table.add_column("Category", style="white", no_wrap=True)
    overview_table.add_column("Progress", style="white")
    overview_table.add_column("Details", style="dim")
    
    overview_table.add_row("🏢 Organizations", progress_bar(avg_org_completion), f"{len(org_completions)} orgs - {org_total_completed}/{org_total_possible} fields")
    overview_table.add_row("🤖 Models", progress_bar(avg_model_completion), f"{len(model_completions)} models - {model_total_completed}/{model_total_possible} fields")
    overview_table.add_row("📊 Benchmarks", progress_bar(bench_completion), f"{len(get_all_benchmarks())} benchmarks - {bench_total_completed}/{bench_total_possible} fields")
    overview_table.add_row("📈 Model Benchmark Coverage", progress_bar(bench_coverage), "Models with ≥5 benchmarks (baseline target)")
    overview_table.add_row("🔌 API Providers", progress_bar(api_completion), f"{len(get_all_api_providers())} providers - {api_total_completed}/{api_total_possible} fields")
    overview_table.add_row("🌐 Model API Coverage", progress_bar(api_coverage), "Models with ≥1 API provider")
    overview_table.add_row("💰 Model Pricing Coverage", progress_bar(pricing_coverage), "Models with pricing data")
    overview_table.add_row("📋 Subscription Plans", progress_bar(sub_completion), f"{len(get_all_subscription_plans())} plans - {sub_total_completed}/{sub_total_possible} fields")
    
    console.print(overview_table)
    console.print()
    
    # Detailed Organization Breakdown
    console.print("[bold underline]🏢 ORGANIZATION DETAILS[/bold underline]")
    console.print()
    
    org_details = []
    for org_id, completion in sorted(org_completions.items(), key=lambda x: x[1]):
        org_path = JSON_EXPORT_PATH / "organisations" / org_id / "organisation.json"
        org_data = load_json_file(org_path)
        
        if not org_data:
            org_details.append([org_id, f"{completion:.1f}%", "❌ No data", "❌ No links", "N/A"])
            continue
        
        # Basic fields status
        basic_fields = ["organisation_id", "name", "country_code", "description", "colour"]
        present_basic = [f for f in basic_fields if org_data.get(f)]
        missing_basic = [f for f in basic_fields if not org_data.get(f)]
        basic_status = f"✅ {len(present_basic)}/{len(basic_fields)}" if missing_basic else "✅ Complete"
        
        # Links status
        links = org_data.get("organisation_links", [])
        present_platforms = {link.get("platform") for link in links if link.get("platform")}
        present_links = present_platforms & EXPECTED_ORG_PLATFORMS
        missing_links = EXPECTED_ORG_PLATFORMS - present_platforms
        links_status = f"✅ {len(present_links)}/{len(EXPECTED_ORG_PLATFORMS)}" if missing_links else "✅ Complete"
        
        # Description preview
        desc = "✅" if org_data.get("description") else "❌"
        
        org_details.append([org_id, f"{completion:.1f}%", basic_status, links_status, desc])
    
    org_table = Table(show_header=True, header_style="bold cyan", title="Organization Completion Details")
    org_table.add_column("Organization", style="white", no_wrap=True)
    org_table.add_column("Completion", style="yellow", justify="right")
    org_table.add_column("Basic Fields", style="green")
    org_table.add_column("Link Platforms", style="blue") 
    org_table.add_column("Description", style="dim", max_width=40)
    
    for row in org_details:
        org_table.add_row(*row)
    
    console.print(org_table)
    console.print()
    
    # Detailed Model Breakdown
    console.print("[bold underline]🤖 MODEL DETAILS[/bold underline]")
    console.print()
    
    model_details = []
    for model_id, completion in sorted(model_completions.items(), key=lambda x: x[1])[:20]:  # Top 20 worst
        org_id = model_to_org.get(model_id)
        short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
        model_path = JSON_EXPORT_PATH / "models" / (org_id or "unknown") / short_model_id / "model.json"
        model_data = load_json_file(model_path)
        
        if not model_data:
            model_details.append([model_id, f"{completion:.1f}%", "❌", "❌", "❌", "❌", "❌", "❌", "❌"])
            continue
        
        display_id = model_data.get("model_id", model_id)
        
        # Get status and expected fields
        status = model_data.get("status", "")
        expected_fields = get_expected_model_fields(status)
        
        # Basic details status
        expected_basic = expected_fields["basic"]
        basic_detail_score = sum(1 for field in expected_basic if model_data.get(field) is not None)
        basic_status = f"✅ {basic_detail_score}/{len(expected_basic)}" if expected_basic else "✅ N/A"
        
        # Links status
        expected_links = expected_fields["links"]
        if expected_links:
            links = model_data.get("links", [])
            present_links = {link.get("platform") for link in links if link.get("platform")}
            present_expected = present_links & expected_links
            links_status = f"✅ {len(present_expected)}/{len(expected_links)}"
        else:
            links_status = "✅ N/A"
        
        # Technical details status
        expected_technical = expected_fields["technical"]
        if expected_technical:
            details = model_data.get("details", [])
            present_details = {detail.get("name") for detail in details if detail.get("name")}
            present_expected_details = present_details & expected_technical
            details_status = f"✅ {len(present_expected_details)}/{len(expected_technical)}"
        else:
            details_status = "✅ N/A"
        
        # License and additional details
        expected_non_prop = expected_fields["non_proprietary"]
        license_val = (model_data.get("license") or "").lower()
        is_proprietary = "proprietary" in license_val
        if not is_proprietary and expected_non_prop:
            present_details = {detail.get("name") for detail in model_data.get("details", []) if detail.get("name")}
            non_prop_score = len(present_details & expected_non_prop)
            extra_status = f"✅ {non_prop_score}/{len(expected_non_prop)}"
        elif is_proprietary:
            extra_status = "✅ N/A (Proprietary)"
        else:
            extra_status = "✅ N/A"
        
        # Alias status
        alias_expected = expected_fields.get("alias_expected", True)
        if not alias_expected:
            alias_status = "✅ N/A"
        else:
            aliases_path = JSON_EXPORT_PATH / "aliases"
            alias_file_id = model_data.get("model_id", model_id)
            has_alias = False
            if aliases_path.exists():
                for alias_dir in aliases_path.iterdir():
                    if alias_dir.is_file() and alias_dir.suffix == '.json':
                        alias_data = load_json_file(alias_dir)
                        if alias_data and alias_data.get("resolved_model_id") == alias_file_id:
                            has_alias = True
                            break
            alias_status = "✅" if has_alias else "❌"
        
        # Family status
        family_expected = expected_fields.get("family_expected", True)
        if not family_expected:
            family_status = "✅ N/A"
        else:
            family_status = "✅" if model_data.get("model_family_id") else "❌"
        
        # Benchmarks count
        benchmarks = model_data.get("benchmarks", [])
        bench_count = len(benchmarks)
        bench_status = f"✅ {bench_count}" if bench_count >= 5 else f"⚠️ {bench_count}"
        
        model_details.append([
            display_id[:30], 
            f"{completion:.1f}%", 
            basic_status,
            links_status, 
            details_status, 
            extra_status, 
            alias_status, 
            family_status, 
            bench_status
        ])
    
    model_table = Table(show_header=True, header_style="bold cyan", title="Model Completion Details (Worst 20)")
    model_table.add_column("Model", style="white", no_wrap=True, max_width=30)
    model_table.add_column("Completion", style="yellow", justify="right")
    model_table.add_column("Basic Details", style="green")
    model_table.add_column("Links", style="blue")
    model_table.add_column("Tech Details", style="magenta")
    model_table.add_column("Extra Details", style="cyan")
    model_table.add_column("Alias", style="red")
    model_table.add_column("Family", style="purple")
    model_table.add_column("Benchmarks", style="purple")
    
    for row in model_details:
        model_table.add_row(*row)
    
    console.print(model_table)
    console.print()
    
    # Top 20 models
    top_model_details = []
    for model_id, completion in sorted(model_completions.items(), key=lambda x: x[1], reverse=True)[:20]:  # Top 20 best
        org_id = model_to_org.get(model_id)
        short_model_id = model_id.split('/', 1)[1] if '/' in model_id else model_id
        model_path = JSON_EXPORT_PATH / "models" / (org_id or "unknown") / short_model_id / "model.json"
        model_data = load_json_file(model_path)
        
        if not model_data:
            top_model_details.append([model_id, f"{completion:.1f}%", "❌", "❌", "❌", "❌", "❌", "❌", "❌"])
            continue
        
        display_id = model_data.get("model_id", model_id)
        
        # Get status and expected fields
        status = model_data.get("status", "")
        expected_fields = get_expected_model_fields(status)
        
        # Basic details status
        expected_basic = expected_fields["basic"]
        basic_detail_score = sum(1 for field in expected_basic if model_data.get(field) is not None)
        basic_status = f"✅ {basic_detail_score}/{len(expected_basic)}" if expected_basic else "✅ N/A"
        
        # Links status
        expected_links = expected_fields["links"]
        if expected_links:
            links = model_data.get("links", [])
            present_links = {link.get("platform") for link in links if link.get("platform")}
            present_expected = present_links & expected_links
            links_status = f"✅ {len(present_expected)}/{len(expected_links)}"
        else:
            links_status = "✅ N/A"
        
        # Technical details status
        expected_technical = expected_fields["technical"]
        if expected_technical:
            details = model_data.get("details", [])
            present_details = {detail.get("name") for detail in details if detail.get("name")}
            present_expected_details = present_details & expected_technical
            details_status = f"✅ {len(present_expected_details)}/{len(expected_technical)}"
        else:
            details_status = "✅ N/A"
        
        # License and additional details
        expected_non_prop = expected_fields["non_proprietary"]
        license_val = (model_data.get("license") or "").lower()
        is_proprietary = "proprietary" in license_val
        if not is_proprietary and expected_non_prop:
            present_details = {detail.get("name") for detail in model_data.get("details", []) if detail.get("name")}
            non_prop_score = len(present_details & expected_non_prop)
            extra_status = f"✅ {non_prop_score}/{len(expected_non_prop)}"
        elif is_proprietary:
            extra_status = "✅ N/A (Proprietary)"
        else:
            extra_status = "✅ N/A"
        
        # Alias status
        alias_expected = expected_fields.get("alias_expected", True)
        if not alias_expected:
            alias_status = "✅ N/A"
        else:
            aliases_path = JSON_EXPORT_PATH / "aliases"
            alias_file_id = model_data.get("model_id", model_id)
            has_alias = False
            if aliases_path.exists():
                for alias_dir in aliases_path.iterdir():
                    if alias_dir.is_file() and alias_dir.suffix == '.json':
                        alias_data = load_json_file(alias_dir)
                        if alias_data and alias_data.get("resolved_model_id") == alias_file_id:
                            has_alias = True
                            break
            alias_status = "✅" if has_alias else "❌"
        
        # Family status
        family_expected = expected_fields.get("family_expected", True)
        if not family_expected:
            family_status = "✅ N/A"
        else:
            family_status = "✅" if model_data.get("model_family_id") else "❌"
        
        # Benchmarks count
        benchmarks = model_data.get("benchmarks", [])
        bench_count = len(benchmarks)
        bench_status = f"✅ {bench_count}" if bench_count >= 5 else f"⚠️ {bench_count}"
        
        top_model_details.append([
            display_id[:30], 
            f"{completion:.1f}%", 
            basic_status,
            links_status, 
            details_status, 
            extra_status, 
            alias_status, 
            family_status, 
            bench_status
        ])
    
    top_model_table = Table(show_header=True, header_style="bold cyan", title="Model Completion Details (Top 20)")
    top_model_table.add_column("Model", style="white", no_wrap=True, max_width=30)
    top_model_table.add_column("Completion", style="yellow", justify="right")
    top_model_table.add_column("Basic Details", style="green")
    top_model_table.add_column("Links", style="blue")
    top_model_table.add_column("Tech Details", style="magenta")
    top_model_table.add_column("Extra Details", style="cyan")
    top_model_table.add_column("Alias", style="red")
    top_model_table.add_column("Family", style="purple")
    top_model_table.add_column("Benchmarks", style="purple")
    
    for row in top_model_details:
        top_model_table.add_row(*row)
    
    console.print(top_model_table)
    console.print()
    
    # Additional model stats
    zero_completion_models = sum(1 for completion in model_completions.values() if completion == 0.0)
    console.print()
    
    # Model completion histogram
    console.print("[bold]Model Completion Histogram:[/bold]")
    bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    bin_counts = [0] * (len(bins) - 1)
    
    for completion in model_completions.values():
        for i in range(len(bins) - 1):
            if bins[i] <= completion < bins[i + 1]:
                bin_counts[i] += 1
                break
        if completion == 100.0:
            bin_counts[-1] += 1
    
    max_count = max(bin_counts) if bin_counts else 1
    for i, count in enumerate(bin_counts):
        bin_range = f"{bins[i]}-{bins[i+1]}%"
        bar_length = int(40 * count / max_count) if max_count > 0 else 0
        bar = "█" * bar_length + "░" * (40 - bar_length)
        console.print(f"{bin_range:<10} | {bar} {count}")
    
    console.print()
    
    # Benchmark Details
    console.print("[bold underline]📊 BENCHMARK DETAILS[/bold underline]")
    console.print()
    
    # Get benchmark model counts
    benchmark_model_counts = get_benchmark_model_count()
    
    bench_details = []
    for bench_id in get_all_benchmarks():
        bench_path = JSON_EXPORT_PATH / "benchmarks" / bench_id / "benchmark.json"
        bench_data = load_json_file(bench_path)
        
        if not bench_data:
            bench_details.append([bench_id, "❌ No data", "❌", "❌", "❌", "❌", "0"])
            continue
        
        fields = ["benchmark_id", "benchmark_name", "category", "ascending_order", "link"]
        present = sum(1 for f in fields if bench_data.get(f) is not None)
        completion = (present / len(fields)) * 100
        
        name = bench_data.get("benchmark_name", "N/A")[:30]
        category = bench_data.get("category", "N/A")
        order = "✅" if bench_data.get("ascending_order") is not None else "❌"
        link = "✅" if bench_data.get("link") else "❌"
        model_count = benchmark_model_counts.get(bench_id, 0)
        
        bench_details.append([bench_id[:25], f"{completion:.1f}%", name, category, order, link, str(model_count)])
    
    bench_table = Table(show_header=True, header_style="bold cyan", title="Benchmark Completion Details")
    bench_table.add_column("Benchmark ID", style="white", no_wrap=True, max_width=25)
    bench_table.add_column("Completion", style="yellow", justify="right")
    bench_table.add_column("Name", style="green", max_width=30)
    bench_table.add_column("Category", style="blue")
    bench_table.add_column("Order", style="magenta")
    bench_table.add_column("Link", style="cyan")
    bench_table.add_column("Models w/ Scores", style="red", justify="right")
    
    for row in sorted(bench_details, key=lambda x: float(x[1].rstrip('%'))):
        bench_table.add_row(*row)
    
    console.print(bench_table)
    console.print()
    
    # Detailed API Provider Breakdown
    console.print("[bold underline]🔌 API PROVIDER DETAILS[/bold underline]")
    console.print()
    
    api_provider_details = get_api_provider_completion_details()
    api_details = []
    for prov_id, info in sorted(api_provider_details.items(), key=lambda x: x[1]["completion"]):
        api_details.append([
            prov_id, 
            f"{info['completion']:.1f}%", 
            info["basic_fields"], 
            str(info["models_count"]), 
            str(info["active_gateway_models"]), 
            info["description"]
        ])
    
    api_table = Table(show_header=True, header_style="bold cyan", title="API Provider Completion Details")
    api_table.add_column("Provider", style="white", no_wrap=True)
    api_table.add_column("Completion", style="yellow", justify="right")
    api_table.add_column("Basic Fields", style="green")
    api_table.add_column("Models on Provider", style="blue", justify="right")
    api_table.add_column("Active Gateway", style="red", justify="right")
    api_table.add_column("Description", style="dim", max_width=40)
    
    for row in api_details:
        api_table.add_row(*row)
    
    console.print(api_table)
    console.print()
    
    # Subscription Plans Details
    console.print("[bold underline]📋 SUBSCRIPTION PLAN DETAILS[/bold underline]")
    console.print()
    
    subscription_details = get_subscription_plan_completion_details()
    sub_details = []
    for plan_id, info in sorted(subscription_details.items(), key=lambda x: x[1]["completion"]):
        sub_details.append([
            plan_id, 
            f"{info['completion']:.1f}%", 
            info["basic_fields"], 
            str(info["models_count"]), 
            info["description"]
        ])
    
    sub_table = Table(show_header=True, header_style="bold cyan", title="Subscription Plan Completion Details")
    sub_table.add_column("Plan ID", style="white", no_wrap=True)
    sub_table.add_column("Completion", style="yellow", justify="right")
    sub_table.add_column("Basic Fields", style="green")
    sub_table.add_column("Models Included", style="blue", justify="right")
    sub_table.add_column("Description", style="dim", max_width=40)
    
    for row in sub_details:
        sub_table.add_row(*row)
    
    console.print(sub_table)
    console.print()
    
    console.print(f"[dim]Run completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}[/dim]")

print_dashboard()

