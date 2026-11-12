---
"@phaseo/gateway-api": minor
---

Google Live calls now run for up to 60 minutes. When Google replaces its connection (after about 10 minutes, announced with `goAway`), the relay resumes the session on a new connection, keeps the client socket open, sends `relay.provider_reconnected` and carries usage into the same bill, including the context Google reprocesses on resume. The relay now forwards microphone silence to Google so a quiet caller no longer gets cut off after 150 seconds; Google leaves silence out of every turn, so it isn't billed. A `provider_closing` warning (`threshold: "input_idle"`) is sent after 2 minutes with no client audio. Prompt tokens Google reports without a modality breakdown are now billed as text input instead of being dropped.
