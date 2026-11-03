---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/gateway-api": patch
"@phaseo/desktop": patch
"@phaseo/mobile": patch
---

Security hardening from the November review. Signed-in users can no longer write OAuth app records directly, move presets into workspaces they don't belong to, or change extended-log billing state. Internal cache actions check for an admin before doing anything. Forged OAuth tokens can no longer force repeated key refreshes, and workload-identity policies from workspaces outside the rollout no longer make a token ambiguous. Transcription and web-fetch downloads are size- and time-limited, more IPv6 private ranges are blocked, and web-api webhook URLs get the same checks as the gateway. Secret comparisons are constant-time. The web app sends HSTS and a report-only content security policy. Factory marks issue text as untrusted in agent prompts, the desktop update feed is fixed at build time, and mobile chat only opens web and email links.
