---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/gateway-api": patch
---

Add the workspace Classifiers settings page: create, edit, test and delete request classifiers from presets (department, audience, task type, engineering work, agent complexity, compliance), with sampling, scope, a monthly budget and this month's spend. Owners and admins only. Classifier validation and the classification request now come from one shared module used by the gateway, the settings API and the page. The gateway no longer classifies a request that already carries the phaseo.classifier label, so a settings test run is not classified again.
