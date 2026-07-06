# Phaseo Python SDK

Phaseo is the new name for AI Stats.

This package reserves the `phaseo` PyPI name and installs the current Phaseo Python SDK distribution, which is still published as `ai-stats-py-sdk` during the package migration.

```bash
pip install phaseo
```

Existing imports continue to work:

```python
from ai_stats import AIStats
```

The `phaseo` import also re-exports the current SDK surface:

```python
from phaseo import AIStats
```

Package names, import paths, and documentation will continue moving to Phaseo as the migration is completed.
