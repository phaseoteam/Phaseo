---
"@phaseo/gateway-api": minor
---

The realtime relay supports ElevenLabs Realtime (`eleven-labs/eleven-realtime-v1-mini`). The relay connects with the gateway's ElevenLabs key, so the key never reaches the client. It meters connected time during the call for holds and the overdraft cap, then settles with ElevenLabs' reported charge for the conversation as a floor, billing its LLM tokens and minutes at list price. Calls run for up to 30 minutes. The model needs its catalogue and price rows before it can be used.
