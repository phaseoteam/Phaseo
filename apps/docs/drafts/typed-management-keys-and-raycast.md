# Draft changelog: Typed management keys and Raycast

> **Publication note:** choose the release date after the API and dashboard are
> deployed, then move the block below into `apps/docs/v1/changelog.mdx` and
> replace `[Publish date]` with the real calendar date.

## [Publish date]

<p style={{ fontSize: "1rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.5rem" }}>Product</p>

- Management API keys now use the dedicated `phaseo_v1_mk_...` format; regular `phaseo_v1_sk_...` keys remain inference-only.
- Management routes now require typed management keys before any key lookup, preventing gateway keys from being treated as control-plane credentials.
- Management key creation now offers Raycast, Read, Write, and All access templates that expand to explicit capabilities.
- OAuth app owners can manage allowed scopes, while existing user grants remain unchanged until the user approves additional requested scopes.
- The Phaseo Raycast extension adds cached model, organisation, and provider browsing plus read-only Usage & Credits and Recent Gateway Activity commands.

