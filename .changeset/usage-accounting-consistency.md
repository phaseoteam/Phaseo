---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Make usage accounting and workspace rules consistent across request paths.

- Models called by the advisor, subagent and fusion tools follow the workspace policy, guardrails and data-retention rules of the request, and requests asking them for more than 8 uses or 32,000 tokens are rejected.
- A completed response with no visible output is charged for the usage the provider reported; the request still returns 502.
- Streamed requests that use server tools are charged as each round completes, and interrupted streams include an estimate of the prompt until the provider reports usage.
- Transcriptions without a provider-reported duration are always measured from the uploaded file.
- Grok Imagine Image 2.0 generation validates `size` and `resolution` the same way as edits.
- A workspace with a negative balance or credits on hold cannot be deleted until it is settled.
- Top-up checkout always settles in USD; auto top-up settings change only through the settings endpoint; a redeemed credit code stays redeemed for the user.
