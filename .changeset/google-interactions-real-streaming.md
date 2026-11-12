---
"@phaseo/gateway-api": patch
---

Gemini and Gemma models on Google AI Studio stream again. Streamed requests to models on Google's Interactions API (Gemini 2.5, 3, 3.1, 3.5 to 3.8 Flash and Gemma 4) waited for the whole answer and then replayed it; they now stream from Google as it is generated. The answer is held only until its first token, so an empty answer still fails over to another provider. Thought signatures reach Responses and Messages clients on the streamed reasoning, so multi-turn tool calls keep working.
