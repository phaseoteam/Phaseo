---
"@phaseo/gateway-api": minor
---

Route requests for a model that no provider has served for 72 hours to its admin-approved successor, for workspaces that turn this on. A free model is never redirected to a paid one, a successor that costs more is used only if the workspace's price setting allows it, and model and key restrictions still apply to the successor. Redirected responses carry `X-Phaseo-Requested-Model` and `X-Phaseo-Model-Substitution` headers. When the first model has no provider, the models in a request's `models` list are now tried in order before any successor.
