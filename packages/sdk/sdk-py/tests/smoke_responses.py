import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))

from phaseo import Phaseo


def main() -> None:
    api_key = os.environ.get("PHASEO_API_KEY")
    if not api_key:
        raise RuntimeError("PHASEO_API_KEY is required")

    base_url = os.environ.get("PHASEO_BASE_URL")
    model = os.environ.get("PHASEO_SMOKE_MODEL", "openai/gpt-5.4-nano")
    input_text = os.environ.get("PHASEO_SMOKE_INPUT", "Hi")
    try:
        max_output_tokens = int(os.environ.get("PHASEO_SMOKE_MAX_OUTPUT_TOKENS", "32"))
    except ValueError:
        max_output_tokens = 32
    if max_output_tokens <= 0:
        max_output_tokens = 32

    client = Phaseo(api_key=api_key, base_url=base_url)
    response = client.responses.create(
        {
            "model": model,
            "input": input_text,
            "max_output_tokens": max_output_tokens,
        }
    )
    print(json.dumps(response, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
