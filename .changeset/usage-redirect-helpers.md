---
"@phaseo/web": patch
---

Stop every page downloading the usage overview and request log screens. The `/settings/usage` and `/settings/usage/logs` redirects now import a small helper instead of the whole page.
