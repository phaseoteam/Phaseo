# TypeSafe Jev 1.14 rollout

Deploy the Decisions adapter before enabling its new catalogue capabilities.
The previous adapter omits image evidence, so advertising images before the
deployment would allow requests to run without their images.

The live catalogue is in Supabase project `xansbgjaduxypzsmjwct`. Apply targeted
catalogue operations through the Supabase plugin, then read back the affected
rows. This is catalogue content, not a schema migration.

For the existing `typesafe/jev-1.13.0` model and route
`typesafe:typesafe/jev:systemone`:

- Preserve the existing route, variant, SKU and pricing IDs.
- Add `image` to the model and route input modalities alongside `text`.
- Add `images: true` and `long_context: true` to the `decisions.make` capability
  parameters. Keep `box` disabled on 1.13.
- Record the experimental image and long-context support with the official
  sources below. Default context is 64k per request and 32k per question;
  explicit long context raises both to 262k. Let upstream enforce its token
  limits, including image tokens.

Onboard `typesafe/jev-1.14.0` with upstream model `jev-1.14.0`, a TypeSafe
Decisions route, the standard route variant, and input pricing of $0.042 per
million aggregate input tokens. Output remains free. Its input modalities are
`text` and `image`; capability parameters include `images: true`,
`long_context: true` and `box: true`. The release date is 2026-10-14. Preserve
the pinned 1.13 identity; do not move `jev-latest` ahead of the upstream alias.

Read back model, route, capability, variant and pricing rows. Verify requests
with text only, an image predicate, mixed predicate/Box questions, and explicit
long context. Use separately authorized live probes; deterministic adapter and
contract tests do not prove production inference.

Sources checked on 2026-10-14:

- [Release](https://typesafe.ai/blog/jev-1-14)
- [Models, aliases, context and pricing](https://docs.typesafe.ai/models)
- [Images](https://docs.typesafe.ai/images)
- [Box](https://docs.typesafe.ai/primitives/box)
