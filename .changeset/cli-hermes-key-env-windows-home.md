---
"@phaseo/cli": patch
---

Fix Hermes setup with current Hermes releases. Setup now sets Hermes' `model.key_env` to `OPENAI_API_KEY`; without it Hermes only sends that key to OpenAI's own hosts, so requests to Phaseo went out without a key. Setup asks Hermes where its `.env` is (`hermes config env-path`), falling back to `%LOCALAPPDATA%\hermes` on Windows and `~/.hermes` elsewhere, and moves a key an earlier version wrote to `~/.hermes/.env` on Windows. Removal keeps restoring the other settings and removes the key even if one setting fails, and the setup messages show the real file path.
