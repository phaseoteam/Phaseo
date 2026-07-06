from phaseo import Phaseo

import os

def main() -> None:
    api_key = os.environ.get("PHASEO_API_KEY")
    if not api_key:
        raise RuntimeError("Set PHASEO_API_KEY")

    client = Phaseo(api_key=api_key, base_url=os.environ.get("PHASEO_BASE_URL", "https://api.phaseo.ai/v1"))
    model = os.environ.get("PHASEO_SMOKE_MODEL", "openai/gpt-5.4-nano")
    input_text = os.environ.get("PHASEO_SMOKE_INPUT", "Hi")
    request = {
        "model": model,
        "messages": [{"role": "user", "content": input_text}],
    }
    response = client.chat_completions(request)
    print("ok:", bool(response.id), response.model)


if __name__ == "__main__":
    main()
