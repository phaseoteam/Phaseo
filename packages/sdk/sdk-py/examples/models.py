import os

from ai_stats import AIStats


def main():
    api_key = os.environ.get("AI_STATS_API_KEY")
    if not api_key:
        raise RuntimeError("Set AI_STATS_API_KEY")

    client = AIStats(api_key=api_key)
    models = client.get_models(
        {
            "provider": ["anthropic"],
            "provider_status": ["beta", "not_ready"],
            "provider_availability_reason": ["preview_only", "provider_not_ready"],
            "capability_status": ["coming_soon", "internal_testing"],
            "availability": "all",
            "limit": 5,
        }
    )
    preview = [
        {
            "id": model.get("id"),
            "provider": model.get("provider"),
            "status": model.get("status"),
        }
        for model in models.get("models", [])[:5]
        if isinstance(model, dict)
    ]
    print("model preview:", preview)


if __name__ == "__main__":
    main()
