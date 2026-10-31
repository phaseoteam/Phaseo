---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
"@phaseo/web": minor
---

Preset labels can be managed. `GET /v1/presets/{id}/labels` lists labels, `PUT /v1/presets/{id}/labels/{label}` points a label at a published version (by `version_id`, or by `version` such as "v3"), and `DELETE /v1/presets/{id}/labels/{label}` removes one. Listing versions now returns the labels on each version. In the dashboard, the preset editor lists published versions with their labels, moves a label to another version in one step (moving it back is a rollback), and shows the `@slug@label` reference to copy.
