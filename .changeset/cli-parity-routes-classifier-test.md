---
"@phaseo/gateway-api": minor
"@phaseo/cli": minor
"@phaseo/sdk": minor
---

Add `POST /v1/classifiers/test`, which runs a saved or draft request classifier once on a sample, the same way as the dashboard's test. It makes a real, billed model request with the caller's own credential and labels it `phaseo.classifier_test`. The credential must have `classifiers:write` and `gateway:access`. Management keys are refused, and no key is ever created for the caller.

The CLI gains commands for the routes that replaced dashboard-only settings: `rate-limits tier get|raise`, `invites accept|requests`, `routing auto get|update`, `routing successors list|set|remove`, `observability destinations test|sample|test-config`, `authorized-apps list|revoke|update-scopes`, `profile get|update` and `classifiers test`. `keys update` also gains `--ip-allowlist`.

The API reference now has pages for these routes in every docs language.
