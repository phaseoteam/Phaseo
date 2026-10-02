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
gateway:access can explicitly request it for the Phaseo MCP resource and grant consent.
No paid provider calls or production deployments are part of local validation.

## Visual design and release checks

The explorer follows Phaseo's default light/dark tokens in
`apps/web/src/app/globals.css`: neutral surfaces, blue accents, Montserrat,
6px controls and 10px panels. Montserrat's Latin variable WOFF2 is bundled inline
from @fontsource-variable/montserrat 5.3.0, with its SIL OFL license in ui/assets
and a readable Font license disclosure in the delivered HTML.
The actual Phaseo mark appears in the header and the monochrome host entrypoint;
the plugin manifest retains light/dark listing and composer logos.

Before release:
- Review and merge PR 2680 after current checks and review threads are clear.
- Deploy API first, then MCP with the inference receipt migration and bindings.
- Verify default read-only OAuth and optional gateway:access consent in the real host.
- Verify light/dark logos, sidebar/thread entrypoints, deep links and attached context.
- With an explicitly approved spend limit, verify one paid text run and its billing.
- Publish the prepared private plugin update and verify its installed version.

Local fixtures verify visual and interaction behavior; they do not confirm these
authenticated host or production steps.

Existing read-only dynamic OAuth clients can request optional inference consent
for the canonical Phaseo MCP resource. This does not update their stored allowlists,
existing grants, or default scopes. The host's consent flow still needs live verification.
