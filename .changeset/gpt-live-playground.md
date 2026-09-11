---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
---

Add GPT Live 1 to the Realtime playground with dedicated Live session APIs, all built-in voices, configurable Responses delegation and optional web search. Price voice duration, backend tokens/cache usage and native tool calls separately with snapshotted tier-aware prices. Preserve final usage across disconnects, retain holds when usage is incomplete, and show delegation usage and component costs.

Verify microphone frames and resume capture/playback before opening a billable Live connection. Report first audio forwarding, microphone signal and provider audio, and stop disconnected or stalled capture. Include offline browser checks for the room's audio round trip, blocked permissions, autoplay and cleanup without paid provider calls.

Show short, documented language, regional influence and presentation descriptions for 12 Live voices, with wrapping text in the voice selector.

Keep the session overview scrollable above the call controls and present delegation usage in a keyboard-accessible, bounded disclosure panel, using ShadCN Scroll Area for both scrollable regions.

Use ShadCN Scroll Area in the realtime/delegation settings dialog and keep the dialog within short mobile viewports.
