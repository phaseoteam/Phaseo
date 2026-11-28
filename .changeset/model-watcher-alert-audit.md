---
"@phaseo/gateway-api": patch
---

Store the text of each delivered model watcher alert on its run row and keep alerted runs for 60 days, so false positives can be audited. AtlasCloud discovery also reads modalities from an OpenRouter-style `architecture` block and keeps entries with no category or modality, ending a false "failing" report since 2026-11-24.
