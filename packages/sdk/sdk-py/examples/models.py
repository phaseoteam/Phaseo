import os

from ai_stats import AIStats


def main():
    api_key = os.environ.get("AI_STATS_API_KEY")
    if not api_key:
        raise RuntimeError("Set AI_STATS_API_KEY")

    client = AIStats(api_key=api_key)
    models = client.get_models({"limit": 5})
    print("models:", [m.model for m in models.models[:5]])


if __name__ == "__main__":
    main()
