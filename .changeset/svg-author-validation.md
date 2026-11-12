---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Reject an SVG `svg.model` without an OpenAI text price as a plain `validation_error` before routing, instead of a wrapped provider error. Request details now show each pricing line's quantity and cost, and label the lines billed for the SVG author model.
