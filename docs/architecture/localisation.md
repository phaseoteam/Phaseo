# Phaseo localisation architecture

Status: Ten-locale application launch implemented; native and legal review remains required

Date: 2026-08-30

## Decision

Phaseo should use:

- repository-owned ICU message catalogs and `next-intl` for the Next.js application;
- self-hosted Weblate as the translation control plane;
- Git pull requests and the existing Phaseo CI checks as the only production delivery path;
- locale-prefixed non-default URLs, while preserving the current English URLs;
- Mintlify's language directories for the first documentation pilot;
- in-repository rendering for transactional notifications before they are localised.

Weblate is not a runtime dependency. Phaseo builds reviewed translations into each release and continues to operate if Weblate is unavailable.

The default source locale should be British English (`en-GB`) for application catalogs. Mintlify identifies English as `en`, so its English content remains under the existing `v1` tree while following the same British-English terminology guide.

The first public application cohort contains British and US English,
Simplified Chinese, Hindi, Spanish (Spain), French (France), German, Brazilian
Portuguese, Japanese, and Arabic. The canonical tags match Apple App Store
Connect: `en-GB`, `en-US`, `zh-Hans`, `hi`, `es-ES`, `fr-FR`, `de-DE`,
`pt-BR`, `ja`, and `ar-SA`. Product UI, settings, shared chrome, authentication,
tools, catalog surfaces, and help-centre content use these locale catalogs.
Binding legal clauses and long-form editorial bodies remain canonical English
until native legal or editorial review approves a translated version.

The longer-term breadth benchmark is parity with Apple's current 50 App Store
metadata localizations. Apple distinguishes metadata localization from app UI
localization; Phaseo must not claim Apple-scale product support until each
surface is actually translated, reviewed, routed, and tested. Subagents and
machine translation create drafts only.

## Why this design

Weblate is the best fit for Phaseo's ownership requirements:

- It is GPL-3.0-or-later and can be run entirely on Phaseo-controlled infrastructure.
- It has native Git and GitHub pull-request workflows.
- Translation memory, glossaries, reviews, language-scoped permissions, OAuth, LDAP, and SAML are available in the self-hosted product.
- Its OpenAI translation engine accepts a custom base URL and model, so it can use `https://api.phaseo.app/v1` with an approved Phaseo model ID.
- It also supports local Ollama when model inference must remain on Phaseo-controlled infrastructure.

Tolgee has a polished application workflow, but its self-hosted product is open-core, its free deployment is limited to ten seats, and SSO and granular permissions require a paid licence. Its current Git workflow also depends on CLI push/pull automation rather than Weblate's native PR loop.

A Git-only workflow remains the fallback. It removes the service, database, and cache, but gives up translator-specific access, shared translation memory, glossary enforcement, and review queues.

Primary references:

- [Apple App Store localization matrix](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations)
- [Apple App Store Connect locale shortcodes](https://developer.apple.com/documentation/appstoreconnectapi/managing-metadata-in-your-app-by-using-locale-shortcodes)
- [Apple agent-assisted localization guidance](https://developer.apple.com/documentation/Xcode/localizing-your-app-using-agents)
- [Apple localization quality guidance](https://developer.apple.com/localization/)
- [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router)
- [next-intl locale routing for Next.js 16](https://next-intl.dev/docs/routing/setup)
- [Weblate Docker deployment](https://docs.weblate.org/en/latest/admin/install/docker.html)
- [Weblate VCS integration](https://docs.weblate.org/en/latest/vcs.html)
- [Weblate translation memory](https://docs.weblate.org/en/latest/admin/memory.html)
- [Weblate machine translation](https://docs.weblate.org/en/latest/admin/machine.html#openai)
- [Mintlify internationalisation](https://www.mintlify.com/docs/guides/internationalization)

## Current readiness

### Web application

The application now launches in ten locales across the public route tree and
authenticated product surfaces:

- `next-intl` is configured with URL-authoritative, `as-needed` locale routing;
- all `en-GB` pages retain unprefixed canonical URLs, while the other nine
  locales use explicit prefixes such as `/de-DE/models`;
- an unprefixed first visit negotiates `Accept-Language`; explicit language
  choices take precedence and are remembered for one year in the
  non-sensitive `PHASEO_LOCALE` preference cookie;
- runtime loaders cover auth, common chrome, site, catalogue, content, product,
  settings, profile, billing, subscription, and utility catalogs;
- the footer exposes a flagged, native-name locale switcher that preserves the
  current page path;
- locale metadata emits localized canonical URLs, all public hreflang variants,
  and `x-default`;
- full catalogs for `zh-Hans`, `hi`, `es-ES`, `fr-FR`, `de-DE`, `pt-BR`, `ja`,
  and `ar-SA`, plus sparse `en-US` regional overlays, are wired into the same
  schema and CI validation;
- an admin-only, read-only internal localization preview renders real UI with
  each catalog, including nested `lang`/`dir` and Arabic RTL;
- `en-XA` is a generated pseudo-catalog available to the internal preview and
  runtime catalog type, but deliberately excluded from public routing and the
  ten-locale review cohort;
- CI runs catalog key, empty-value, ICU-structure, plural-rendering, protected
  token, deterministic pseudo-localisation, and minimum-expansion checks;
- the localized root layout emits request-correct document `lang`, `dir`, and
  script-specific fonts while preserving technical API and callback routes;
- locale switchers preserve safe return paths and their explicit links work
  without client JavaScript;
- OAuth, email confirmation, reset-password, MFA, passkey, and enterprise SSO
  hand-offs validate and carry locale explicitly while their technical routes
  remain unprefixed;
- localized metadata emits canonical URLs, language alternates, `x-default`, and
  correct Open Graph locale identifiers; auth remains intentionally `noindex`;
- the composed Next.js Proxy negotiates the public page tree while APIs, assets,
  OAuth callbacks, session refresh, Markdown, and existing technical routes
  retain their required unprefixed behavior;
- `cacheComponents` and partial prefetching remain enabled, with locale route
  parameters preserving static generation across the public locale matrix.

Translations are machine-assisted drafts and still require native-speaker QA.
Legal and editorial exceptions must remain clearly identified until separately
reviewed; locale availability must not imply that those English source bodies
have received legal approval in another language.

### Documentation

`apps/docs` contains approximately 459 MDX pages and 121,000 words. The current `docs.json` has one navigation tree and a single canonical docs URL. Its `api.examples.languages` setting selects code-sample languages; it does not localise the site.

Mintlify supports language-specific navigation, paths, metadata, and partial launches. Weblate added MDX parsing in 2026.5, but the parser is still marked as under development and cannot reliably re-import edits made directly to translated MDX. Pilot representative files before importing the full docs tree.

Publishing the pilot also requires an explicit `navigation.languages` configuration in `apps/docs/docs.json`: keep `en` first as the default, provide a complete navigation tree with translated labels for each enabled language, and place translated pages at unique language-prefixed paths. Validate localized metadata, canonical URLs, alternate-language links, and links within every language tree.

Mintlify remains the hosted docs renderer. Self-hosting the localisation workflow does not self-host documentation publishing. Replacing Mintlify would be a separate platform migration involving the 1,500-line vendor configuration, navigation, API reference, search, redirects, and MDX components.

### Notifications and email

Transactional notification copy is split across the API, web API, Resend templates, and Resend automations. The email outbox stores a template, subject, and payload, but not a locale. Some events fan one English message into email, Slack, Discord, Teams, and generic webhooks.

Before translating notifications:

1. store a stable event kind and raw parameters;
2. resolve and snapshot the recipient or destination locale when the event is queued;
3. render each human channel from version-controlled templates;
4. keep machine webhook fields, codes, and values stable;
5. add snapshot tests for every locale and high-risk security or billing message.

This moves localisation ownership into the repository even if Resend remains the delivery provider.

### Mobile, CLI, SDKs, and catalog data

- The Expo mobile application is only about 500 TS/TSX lines and is a strong non-web pilot after the shared catalog conventions exist.
- Localise CLI help, prompts, and human errors later. Never change command names, flags, exit behavior, or `--json` keys and values by locale.
- Localise SDK README prose only after the docs workflow is proven. Never edit or translate generated SDK source, identifiers, methods, enums, or code examples.
- Keep the canonical model/provider/pricing catalog locale-neutral. It contains more than 7,000 records and mixes public prose with provenance and contract fields. If public descriptions are translated later, use a sparse overlay keyed by canonical entity ID, field, locale, and English source hash.

## Ownership boundary

| Surface | Localise | Keep locale-neutral |
| --- | --- | --- |
| Web and mobile UI | Headings, labels, help, accessibility text, validation presentation, dates, numbers, lists, relative time | IDs, model/provider names, API paths, code, raw enum values |
| Public metadata | Titles, descriptions, Open Graph copy, `lang`, `dir`, canonical and alternate links | Stable entity slugs and canonical IDs |
| Docs | Prose, headings, navigation, frontmatter, alt text, callouts | Commands, code, environment variables, endpoints, field names, generated OpenAPI |
| Notifications | Subject and rendered human channel body | Event kind, payload schema, webhook keys, audit values |
| API and SDK | UI mapping of stable errors | Wire fields, error codes, identifiers, generated source, request/response shapes |
| Catalog | Later sparse public-description overlays | Canonical JSON, provenance, pricing, capabilities, units, currency, source URLs |
| Legal | Only reviewed, jurisdiction-approved translations | The canonical English agreement and version history |

Changing presentation locale must never silently change the billed currency, pricing source, time zone semantics, model identifier, or API behavior.

## Web target architecture

### Routing

Use `next-intl` with a top-level `[locale]` segment for human-facing pages:

```text
apps/web/messages/en-GB/common.json
apps/web/messages/en-GB/auth.json
apps/web/messages/<locale>/common.json
apps/web/messages/<locale>/auth.json
apps/web/src/i18n/routing.ts
apps/web/src/i18n/request.ts
apps/web/src/i18n/navigation.ts
apps/web/src/app/[locale]/...
```

`auth.json` exists today. Add `common.json` with the first shared-chrome slice;
do not create an empty placeholder catalog for Weblate.

Use `localePrefix: "as-needed"` so current English URLs such as `/models` remain canonical while another locale uses `/fr-FR/models`. Keep API routes, `_next`, assets, OG endpoints, well-known endpoints, docs proxy routes, ingest, robots, and sitemap outside locale negotiation.

Compose locale handling into the existing `proxy.ts`. Before moving routes, add locale-aware wrappers for links, redirects, return URLs, blog path parsing, settings authentication, and MFA redirects. A second proxy is not possible and duplicating this logic would create security regressions.

Use generated async route `params` and `generateStaticParams` for supported
public locales. The partial rollout has a sibling unlocalized root normalized
to `/`, for which Next.js 16.3 does not generate a universal
`next/root-params` getter. The locale root therefore validates its own route
param and passes locale explicitly into translated work; middleware supplies
the same validated value to next-intl request configuration. Do not read locale
cookies or browser headers from the root layout, and keep catalog/data fetches
locale-neutral.

### Catalogs and formatting

- English catalogs are the schema and source of truth.
- Use stable semantic keys, not English source text as keys.
- Keep catalogs split by genuine product surface rather than by component file.
- Use ICU messages for interpolation, select, and plural behavior.
- Enable Weblate's `icu-message-format` check on nested JSON components.
- Centralise date, number, currency, percentage, list, display-name, and relative-time formatting.
- Add type augmentation so TypeScript validates message keys and interpolation arguments.
- Generate an expanded pseudo-locale in CI to expose truncation, concatenated sentences, and missed strings.
- Keep `dir` in the locale registry and exercise the staged Arabic catalog in
  the internal preview. Complete an explicit bidi, logical-CSS, icon, form,
  and font pass before launching an RTL locale.

Do not fetch catalogs from Weblate at request time. A missing control-plane service must not break Phaseo or change copy between otherwise identical deployments.

### Locale precedence

Use this precedence, with the URL authoritative for public pages:

1. explicit locale in the URL;
2. an authenticated user's saved preference;
3. the explicit locale cookie;
4. browser or operating-system preference on first visit;
5. `en-GB` fallback.

Persist a BCP-47 locale on the normal user profile. Add a separate workspace/destination default for shared notification channels. Snapshot the resolved locale into asynchronous outbox records so later preference changes do not alter an already queued message.

## Self-hosted control plane

The runnable single-node foundation lives in `ops/localisation`. It follows Weblate's official three-service deployment: Weblate, PostgreSQL, and Valkey.

```text
English source PR -> protected main -> authenticated or scheduled Weblate update
Weblate TM / glossary / Phaseo MT / human review
                    -> translation PR -> Phaseo CI -> protected main
```

Production rules:

- pin the Weblate, PostgreSQL, and Valkey versions and review upgrades;
- expose Weblate only through a TLS reverse proxy and Weblate authentication. If an additional proxy login is used, exempt only the exact signed integration callback paths that must be reached by the selected code host;
- close public registration and require sign-in;
- default to a repository-scoped bot with only metadata read, contents read/write, and pull requests read/write; treat the broader native GitHub App manifest as a separately reviewed alternative;
- avoid the unsigned generic GitHub webhook in the bot flow; use Weblate's scheduled fetch, an authenticated management/API update, or the native App's dedicated signed callback;
- back up PostgreSQL, `/app/data`, repository credentials, SSH/GPG keys, and Borg credentials; test restores;
- monitor `/healthz/`, background workers, repository failures, disk, database, and backup age;
- disable `Push on commit`, enable dedicated reviews, set the translation quality filter to approved translations only, keep automatic suggestion acceptance at zero, make machine output suggestions, and restrict commit/push permissions so human approval precedes pull-request updates;
- use a Phaseo route only when its providers are inside the approved data boundary; use local Ollama when inference must remain local;
- enforce outbound allowlists for the chosen Git, mail, identity, and translation services. A true no-egress installation additionally requires those dependencies to be self-hosted.

The supplied Compose file is a local and single-node starting point, not a production ingress or backup solution.

## Weblate component model

Start with the component that has a real source catalog:

1. `phaseo-web-auth`
   - file mask: `apps/web/messages/*/auth.json`
   - base file: `apps/web/messages/en-GB/auth.json`
   - format: nested JSON
   - component flag: `icu-message-format`
2. Add `phaseo-web-common` only when
   `apps/web/messages/en-GB/common.json` contains the first shared-chrome
   source messages.
3. Three MDX pilot components
   - prose: target mask `apps/docs/*/v1/community/faq.mdx`; base and template `apps/docs/v1/community/faq.mdx`
   - component-heavy: target mask `apps/docs/*/v1/index.mdx`; base and template `apps/docs/v1/index.mdx`
   - code-heavy: target mask `apps/docs/*/v1/quickstart.mdx`; base and template `apps/docs/v1/quickstart.mdx`

Request corrections to translated MDX in Weblate. Until its parser supports reliable round trips, do not edit Weblate-owned target MDX directly in a pull request.

## Rollout

### Phase 0: foundation

- The catalog runtime, auth vertical slice, pseudo-locale validator, CI gate,
  ten-locale review cohort, internal preview, and self-hosted Weblate
  evaluation stack are implemented in this worktree.
- Keep named native reviewers accountable for catalog changes after launch.
- Approve the British-English style guide and protected glossary.
- Deploy Weblate privately and prove backup/restore.
- Add stale-source checks when the first human translation catalog is added.
- Add the core user locale and asynchronous locale snapshot design.

### Phase 1: web vertical slices

Implement three end-to-end pilots:

1. `/sign-in` and `/sign-up` for server/client copy and return URLs — implemented;
2. `/countries` for public metadata, region names, counts, shared chrome, and alternate URLs;
3. `/settings/account/details` for protected routing, user preference, dates, and client rendering.

Translate the header, footer, search/command navigation, error boundary, and 404 copy needed by those journeys. Keep every other non-English route unavailable or explicitly marked as English fallback; do not publish indexed pages whose main content remains English.

### Phase 2: safety and onboarding

- Move the eight transactional email variants and workspace notification renderers into locale-aware repository templates.
- Localise the small mobile app.
- Translate the highest-traffic onboarding, authentication, gateway, pricing, error, and routing docs, initially 15-25 pages.

### Phase 3: product expansion

- Expand through settings, usage, catalog presentation labels, help, and curated public pages.
- Add CLI human output.
- Expand docs through guides and cookbook before repetitive SDK reference pages.

### Phase 4: optional content overlays

Add sparse, source-hash-tracked translations for selected public catalog descriptions only when traffic justifies them. Do not fork canonical records per language.

## Required gates

A locale cannot ship until CI verifies:

- identical required keys and no accidental extra keys;
- valid ICU syntax and matching placeholders;
- successful TypeScript type-check, relevant tests, and production build;
- route preservation across locale switching, authentication, MFA, and return URLs;
- correct `<html lang>` and `dir`;
- verified font glyph coverage, shaping, fallback, and layout for Latin, Han,
  and Devanagari scripts; the current Latin-only Montserrat setup is not a
  Chinese or Hindi launch strategy;
- translated metadata, canonical URL, alternate links, and sitemap entries for
  indexable localized routes (authentication is deliberately `noindex`);
- locale-correct numbers, dates, relative time, lists, region names, and currency presentation;
- no indexed English fallback under a non-English canonical URL;
- Mintlify validation and broken-link checks for each enabled docs language;
- layout checks with pseudo-localised long strings and narrow viewports;
- native review of security, billing, legal, and destructive-action copy.

## Explicit non-goals for the first implementation

- No runtime calls to Weblate.
- No direct Weblate pushes to `main`.
- No unreviewed machine-translated production copy.
- No bulk extraction of every hard-coded string.
- No translation of API contracts, generated SDKs, identifiers, code, or canonical catalog records.
- No full MDX import until the three-file pilot proves parser and link safety.
- No Mintlify replacement inside the localisation project.

## Open decisions

Before expanding beyond authentication, Phaseo still needs to choose:

- which product surface and locale cohort ships next, with accountable reviewers;
- whether authenticated non-English routes should also use URL prefixes;
- whether "fully self-hosted" includes replacing Mintlify and/or the email delivery provider;
- where the user and workspace notification locale fields live;
- the approved Phaseo translation route or local-inference model, plus the required outbound network policy;
- which team owns glossary, translation review, Weblate operations, and incident response.
