---
"@phaseo/gateway-api": patch
---

Wafer ZDR requests no longer send the `Wafer-ZDR: required` header. Wafer now applies zero data retention to every Serverless request and documents the header as legacy with no effect, so Wafer and Wafer (ZDR) send identical upstream requests.
