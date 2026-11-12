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
at most two actions; "Compare these" and "Open explorer" request fullscreen. Nothing
opens fullscreen on its own. The resource prefers `inline` (ChatGPT's
`openai/ui.preferredDisplayMode`; Claude is inline by default).

Hosts open entry-point tools fullscreen even when the model calls them, so
`models_list` declares none. The launcher is a separate tool,
`open_model_explorer`, with no inputs: its `openai/ui.entrypoints` (`global` and
`thread`) list it in ChatGPT's sidebar and thread panel and on Claude's Artifacts
page, where people can pin it. It returns the explorer's own first page of the
catalogue. On Claude, custom connectors added by URL and Verified directory
listings get the entry point; Community listings do not.

Cards follow Claude's mobile guidance too: the resource asks for no host border, so
the view pads itself with the host's `safeAreaInsets`; touch screens get 44px tap
targets; and a card-shaped placeholder shows while the tool runs.

The explorer copies the website's models page (`apps/web/src/components/(data)/models/Models/ModelCard.tsx`)
rather than approximating it: logo tile, "Organisation: Model" with the Phaseo ID,
summary chips for price, providers and context, the website's coloured modality
badges (`apps/web/src/lib/models/modalityStyles.ts`) and the release date. One column,
two from 720px. Check changes against phaseo.app/models side by side.

Both hosts' guidelines shape the rest:
- Structural colours (backgrounds, text, borders), radii and the font come from the
  host's MCP Apps variables; the fallbacks are Phaseo's website neutrals. Phaseo blue
  and the modality colours are accents, which both hosts allow. No bundled font.
- No dropdown menus or floating panels: modality is a row of tabs, sort and the
  Gateway filter are toggle chips, and a model opens in place of the list.
- Layout follows the container, down to Claude's 320px side panel.
- No Phaseo logo in the view; the host shows the app name and icon. Organisation
  logos load from the website's logo set (`@phaseo/app-kit/logos`), so the resource
  CSP allows the website origin for images.

The fixture preview (`pnpm dev:ui`) takes `?host=claude` to apply Claude's published
variables and `?width=360` to narrow the frame.

Before release:
- Review and merge PR 2680 after current checks and review threads are clear.
- Deploy API first, then MCP with the inference receipt migration and bindings.
- Verify default read-only OAuth and optional gateway:access consent in the real host.
- Verify light/dark logos, inline cards, "Open explorer", deep links and attached context.
- With an explicitly approved spend limit, verify one paid text run and its billing.
- Publish the prepared private plugin update and verify its installed version.

Local fixtures verify visual and interaction behavior; they do not confirm these
authenticated host or production steps.

Existing read-only dynamic OAuth clients can request optional inference consent
for the canonical Phaseo MCP resource. This does not update their stored allowlists,
existing grants, or default scopes. The host's consent flow still needs live verification.
