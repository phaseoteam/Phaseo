import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))

from ai_stats import AIStats


def main() -> None:
    api_key = os.environ.get("AI_STATS_API_KEY")
    if not api_key:
        raise RuntimeError("AI_STATS_API_KEY is required")

    base_url = os.environ.get("AI_STATS_BASE_URL")
    client = AIStats(api_key=api_key, base_url=base_url)
    response = client.generate_text(
        {
            "model": "openai/gpt-5-nano",
            "messages": [{"role": "user", "content": "Hi"}],
        }
    )
    print(json.dumps(response, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
