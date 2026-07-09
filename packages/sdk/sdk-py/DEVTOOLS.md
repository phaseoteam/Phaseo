# Phaseo Python Devtools

The Python SDK includes built-in telemetry capture.

## Enable

```python
from phaseo import Phaseo, create_phaseo_devtools

client = Phaseo(
    api_key="sk_test_xxx",
    devtools=create_phaseo_devtools(
        directory=".phaseo-devtools",
        capture_headers=False,
    ),
)
```

## View Captured Data

```bash
npx @phaseo/devtools-viewer
```

By default, captured entries are written to:

- `.phaseo-devtools/generations.jsonl`
- `.phaseo-devtools/metadata.json`
