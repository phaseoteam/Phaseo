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

Tool results render inline as cards: `models_list` as rows laid out like the
website's model list, `cost_estimate` as a total with its breakdown, and
`credits_get` as the balance with 30-day usage. Cards have no tabs or drill-ins and
at most two actions; "Compare these" and "Open explorer" request fullscreen, which
the explorer also uses when launched from the sidebar or thread panel. Nothing opens
fullscreen on its own.

Colours fall back to Phaseo's neutral tokens from `apps/web/src/app/globals.css`
but take the host's MCP Apps theme variables and font stack when provided. The cards
bundle no font and show no Phaseo logo, as OpenAI's app guidelines ask; the host
shows the app name and icon. Organisation logos load from the website's logo set
(`@phaseo/app-kit/logos`), so the resource CSP allows the website origin for images.

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
