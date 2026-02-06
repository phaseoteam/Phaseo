from ai_stats import AIStats

import os

def main() -> None:
    api_key = os.environ.get("AI_STATS_API_KEY")
    if not api_key:
        raise RuntimeError("Set AI_STATS_API_KEY")

    client = AIStats(api_key=api_key, base_url=os.environ.get("AI_STATS_BASE_URL", "https://api.phaseo.app/v1"))
    request = {
        "model": "openai/gpt-5-nano",
        "messages": [{"role": "user", "content": "Echo 'Hi'."}],
    }
    response = client.chat_completions(request)
    print("ok:", bool(response.id), response.model)


if __name__ == "__main__":
    main()
