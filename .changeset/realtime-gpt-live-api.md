---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
---

GPT Live (`openai/gpt-live-1`) is now available to API keys through `POST /v1/live/sessions`, not only the playground. Sessions can declare client-executed function tools in `backend_settings.tools`: the relay forwards each `function_call` and accepts the client's `function_call_output` and `response.create` for calls the backend made. Billing is GPT Live's voice seconds plus the backend model's tokens for every response, the same as playground sessions. A session GPT Live expires for lack of audio now ends with the reason `provider_idle_timeout`. The SDKs add `createLiveSession`.
