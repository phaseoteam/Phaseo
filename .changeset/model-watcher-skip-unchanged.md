---
"@phaseo/gateway-api": patch
---

Cut the model watcher's Worker CPU by hashing each provider's `/models` response and reusing the stored models when it is byte-identical to the last processed one (no removal to confirm, no refresh due), instead of parsing and extracting the list again.
