---
"@phaseo/gateway-api": patch
---

Reduce spend warning sweep work by bounding realtime-summary scans and reading only key limits that can still warn. Report each warning sweep's outcome, safe database error code and Worker version in job telemetry.
