# AI Stats Python Devtools

The Python SDK includes built-in telemetry capture.

## Enable

```python
from ai_stats import AIStats, create_ai_stats_devtools

client = AIStats(
    api_key="sk_test_xxx",
    devtools=create_ai_stats_devtools(
        directory=".ai-stats-devtools",
        capture_headers=False,
    ),
)
```

## View Captured Data

```bash
npx @ai-stats/devtools-viewer
```

By default, captured entries are written to:

- `.ai-stats-devtools/generations.jsonl`
- `.ai-stats-devtools/metadata.json`
