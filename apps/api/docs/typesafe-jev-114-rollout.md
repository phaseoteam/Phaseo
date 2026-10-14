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

`typesafe/jev-1.14.0` was onboarded on 2026-10-15 with upstream model
`jev-1.14.0`, route `typesafe:typesafe/jev-1.14.0:systemone`, the standard
route variant, and input pricing of $0.042 per million aggregate input tokens.
Output remains free. Its release date is 2026-10-14. The route currently
accepts text; its image, long-context and Box flags are explicitly disabled
until this adapter is deployed. After deployment, add `image` to the route
input modalities and enable `images`, `long_context` and `box` in its
`decisions.make` capability parameters.

At the user's request, Phaseo's enabled `typesafe/jev-latest` alias now targets
`typesafe/jev-1.14.0`. This follows the latest Phaseo release, ahead of
TypeSafe's own stable alias, which still points to 1.13 in the checked upstream
documentation. Both the previous pinned 1.13 model and route are preserved.

Read back model, route, capability, variant and pricing rows. Verify requests
with text only, an image predicate, mixed predicate/Box questions, and explicit
long context. Use separately authorized live probes; deterministic adapter and
contract tests do not prove production inference.

Sources checked on 2026-10-15:

- [Release](https://typesafe.ai/blog/jev-1-14)
- [Models, aliases, context and pricing](https://docs.typesafe.ai/models)
- [Images](https://docs.typesafe.ai/images)
- [Box](https://docs.typesafe.ai/primitives/box)
