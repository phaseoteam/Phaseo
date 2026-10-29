---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/sdk": minor
---

Add prompt templates to presets. A preset's `prompt` block holds messages with `{{variable}}` placeholders, the variables they take, and optional tools and response format. Chat completions, responses and messages requests send `prompt: { id: "@preset", variables: { … } }`; the gateway checks the values, renders the messages before routing and guardrails, and returns every missing, mistyped or unknown variable in one 400. Templates are validated when a preset is saved or published, and variable names (not values) are recorded on request logs.
