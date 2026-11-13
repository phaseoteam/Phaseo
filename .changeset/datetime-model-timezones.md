---
"@phaseo/gateway-api": patch
---

The `phaseo:datetime` tool now answers with the timezones the model asks for. The tool's own `timezones` are the default when the model sends none, and more than five model timezones return a `too_many_timezones` tool error.
