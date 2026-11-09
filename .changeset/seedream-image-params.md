---
"@phaseo/gateway-api": patch
---

Forward the BytePlus ModelArk image parameters each Seedream family supports: `output_format`, `background` (including transparent PNG output on Seedream 5.5), prompt optimisation modes, and group generation through `n`. Turn the ModelArk watermark off by default; callers can turn it back on with `provider_params.byteplus.watermark`. Seedream 5.5 accepts `provider_params.byteplus.safety_identifier`. Unsupported combinations, such as JPEG with a transparent background or more than one output on single-image models, now return a 400 before the request reaches BytePlus.
