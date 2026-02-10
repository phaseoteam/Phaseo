# Python SDK (ai-stats-py-sdk)

## Install
```bash
pip install ai-stats-py-sdk
```

## Setup
```python
from ai_stats import AIStats

client = AIStats(api_key="your-ai-stats-key")
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
