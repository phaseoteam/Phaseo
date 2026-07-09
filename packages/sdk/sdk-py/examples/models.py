import os

from phaseo import Phaseo


def main():
    api_key = os.environ.get("PHASEO_API_KEY")
    if not api_key:
        raise RuntimeError("Set PHASEO_API_KEY")

    client = Phaseo(api_key=api_key)
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
    print("model count:", len(models.get("models", [])))


if __name__ == "__main__":
    main()
