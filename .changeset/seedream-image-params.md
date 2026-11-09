---
"@phaseo/gateway-api": patch
---

Forward more BytePlus ModelArk image parameters to Seedream: `output_format`, `background` (including transparent PNG output on Seedream 5.5), prompt optimisation, and group generation through `n` on the models that support it. Turn the ModelArk watermark off by default; callers can turn it back on with `provider_params.byteplus.watermark`. Seedream 5.5 accepts `provider_params.byteplus.safety_identifier`. Which parameters and values each Seedream route accepts is declared in the route's catalogue specs, which routing already checks, so the adapter no longer rejects requests itself.
