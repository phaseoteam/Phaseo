# Python SDK (phaseo)

## Install
```bash
pip install phaseo
```

## Setup
```python
from phaseo import Phaseo

client = Phaseo(api_key="phaseo_v1_sk_...")
```

## Text Generation
```python
result = client.generate_text(
    {
        "model": "openai/gpt-4o-mini",
        "messages": [{"role": "user", "content": "Summarize this issue."}],
    }
)
```

## Streaming
```python
for chunk in client.stream_text(
    {
        "model": "openai/gpt-4o-mini",
        "messages": [{"role": "user", "content": "Stream a short answer."}],
    }
):
    print(chunk)
```

## Other Surfaces
- Responses: `generate_response`, `stream_response`
- Images: `generate_image`, `generate_image_edit`
- Audio: `generate_speech`, `generate_transcription`, `generate_translation`
- Video: `generate_video`
- Embeddings: `generate_embedding`
- Moderation: `generate_moderation`
- Discovery: `get_models`, `get_health`

## Migration Rule
Keep credentials in env vars and inject at runtime. Never commit API keys in notebooks, scripts, or test fixtures.
