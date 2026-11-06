---
"@phaseo/gateway-api": minor
"@phaseo/web": patch
---

The gateway routes by requested parameter values as well as names: when some providers of a model accept a requested size, duration, voice or other value and others do not, the request goes to the ones that do, and with `provider.require_parameters` a value no provider accepts fails with the allowed values. Parameters a route marks as unsupported are no longer treated as supported. The internal model editor keeps a route's stored parameter specs when you toggle a parameter (it used to replace every spec with `true`) and edits full specs as JSON with a preview of the allowed values.
