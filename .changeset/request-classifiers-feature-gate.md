---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Put request classifiers behind the `gateway_request_classifiers` Statsig gate while they are in beta. Until a workspace is in the gate, the gateway does not classify its requests, the `/v1/classifiers` management API returns 403 with `reason: request_classifiers_feature_flag_disabled`, and the Classifiers settings page is hidden and returns 404. The gate name can be changed with `STATSIG_REQUEST_CLASSIFIERS_GATE` (gateway) and `NEXT_PUBLIC_STATSIG_REQUEST_CLASSIFIERS_GATE` (web).
