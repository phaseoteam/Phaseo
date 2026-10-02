# Plugin workflows

Users should be able to move from model discovery to integration, reuse a shortlist,
inspect workspace usage, and compare actual text outputs without pasting API keys
into chat. Extend the existing explorer, OAuth connection, and Gateway pipeline.

Acceptance criteria:
- Label attachment as Add to chat context; never imply a conversation-model switch.
- Save named model shortlists on the current device, with explicit storage errors.
- Provide credential-free TypeScript, Python, and curl examples for a selected model.
- Show credits, dated analytics, and recent request health with partial-permission states.
- Quote up to three text model/provider runs before a separate user-triggered Run action.
- Require explicit gateway:access OAuth consent; keep default connections read-only.
- Bind expiring quotes to user, client, workspace, prompt, provider, and output limit.
- Claim each quote once through a Durable Object before billable execution; never retry
  uncertain submissions automatically or store prompts/responses in replay protection.
- Pin providers, recheck prices/capabilities, and use normal Gateway auth/policy/billing.

Inference estimates use prompt UTF-8 bytes plus framing allowance, and the requested
maximum output tokens. They are conservative estimates, not guaranteed billing caps.
Only plain text chat is supported; no tools, files, media, streaming, or replay.
Saved shortlists are local to the device/host, not synced to the Phaseo account.

Rollout requires API auth changes, the MCP Durable Object migration/binding, Worker
deployment, and the private plugin update. Existing registered clients that lack
gateway:access must reconnect with a client permitted to request it and grant consent.
No paid provider calls or production deployments are part of local validation.
