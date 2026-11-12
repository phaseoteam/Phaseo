---
"@phaseo/web": patch
---

Client error reporting ignores known third-party noise (wallet `ethereum` globals, bare cross-origin "Script error.", PostHog request timeouts and browser-extension errors) before capture.
