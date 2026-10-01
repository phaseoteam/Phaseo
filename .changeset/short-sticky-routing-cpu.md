---
"@phaseo/gateway-api": patch
---

Reduce CPU work when computing sticky routing hints by skipping unused request formats and stopping after opening anchors and eight meaningful content parts are found.
