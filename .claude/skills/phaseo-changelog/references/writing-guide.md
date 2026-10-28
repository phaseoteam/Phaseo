# Writing Changelog Entries

How to write each kind of announcement. `changelog-format.md` covers where entries go and how updates and sections are built; this file covers what each bullet says.

Some examples are made up to show a pattern. Never copy a fact, date, price or version from an example; take it from the source.

Examples use root paths such as `/v1/guides/broadcast` so they work in this file. On a changelog page, use the relative link style of the entries around it (`./guides/broadcast.mdx` from `changelog.mdx`, `../guides/broadcast.mdx` from `changelog/*.mdx`).

## Rules for every bullet

- **One change, one sentence.** At most about 25 words before the links. If it needs more, the detail belongs in the docs page you link.
- **Outcome first, present tense.** Start with the thing people touch (Chat, **Settings -> Routing**, `POST /v1/batches`, the Python SDK) and say what it does now: "adds", "can now", "returns", "accepts".
- **Say where and who.** Settings paths in bold with `->`. Endpoints, parameters, headers and status codes in code. If only some people can use it, say so: "Owners and admins can ...".
- **Exact values.** Real names, versions, limits, prices and dates. Prices as `$2` per million input tokens. Dates as `November 4, 2026`, with the time in UTC when it matters.
- **Links at the end, in this order:** `; see [Docs page title](/v1/...)` when a page covers it, then the PRs in brackets, most important first, at most three: `([#3150](https://github.com/phaseoteam/Phaseo/pull/3150), [#3212](https://github.com/phaseoteam/Phaseo/pull/3212))`.
- **Merge PRs that make up one change** into one bullet. Split a PR that made two unrelated changes into two bullets.
- **Only what customers can use today.** Nothing behind a staff-only flag, nothing "coming soon", nothing reverted. An opt-in setting is fine; say it is opt-in.

### Markers

Start the bullet with one bold marker when it applies. Use at most one per bullet.

| Marker | When | The bullet must also say |
|---|---|---|
| `**Breaking:**` | Existing requests, code or settings stop working or behave differently without anyone opting in. | What to change, and from when if it is not immediate. |
| `**Beta:**` | The feature or endpoint is labelled beta in the product or docs. | Nothing extra. Drop the marker when it becomes generally available, and announce that as an availability change. |
| `**Deprecated:**` | Something still works but is scheduled to go. | The removal date and the replacement. |

Localized markers for locale pages:

| en | es | fr | de | pt-BR | ja | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|
| Breaking: | Cambio incompatible: | Changement incompatible : | Inkompatible Änderung: | Alteração incompatível: | 破壊的変更: | 破坏性变更： | असंगत बदलाव: | تغيير غير متوافق: |
| Beta: | Beta: | Bêta : | Beta: | Beta: | ベータ: | 测试版： | बीटा: | تجريبي: |
| Deprecated: | Obsoleto: | Obsolète : | Veraltet: | Obsoleto: | 非推奨: | 已弃用： | अप्रचलित: | مهمل: |

### Words to avoid

| Avoid | Write instead |
|---|---|
| "landed", "shipped", "rolled out", "went live" | Say what people can now do. |
| "improved", "enhanced", "better", "overhauled", "refreshed" | Name the visible difference: "loads the last 30 days", "shows the provider's name". |
| "various", "several", "a number of", "and more" | List the items, or pick the two that matter. |
| "across discovery, gateway and docs" | Say what a user can do with it. |
| "seamless", "powerful", "blazing", "SOTA", "best-in-class" | Nothing. Cut it. |
| "We", "our team" | The product as the subject. |
| PR-title phrasing (`feat(web): add x`) | A sentence a customer would understand. |

Never name competitors, customers, internal tools, Statsig gates or code names.

## Product

Anything people use in phaseo.app, the desktop and mobile apps, and the docs site.

### New feature

Name the feature, say what it does and where it is.

```md
- Logged requests can be opened in Chat and continued from request details or the logs table; see [Open Requests in Chat](/v1/guides/open-requests-in-chat) ([#3084](https://github.com/phaseoteam/Phaseo/pull/3084)).
```

### Improvement to an existing feature

Say what is different on screen, not that it is better.

```md
- Model cards show the cheapest provider's input and output prices, and the pricing hover card names that provider ([#2831](https://github.com/phaseoteam/Phaseo/pull/2831)).
```

### New setting or control

Lead with who and where.

```md
- Owners and admins can limit stored prompts and responses to owners and admins in **Settings -> Privacy -> Who can view contents** ([#3081](https://github.com/phaseoteam/Phaseo/pull/3081)).
```

### Availability change

Beta to generally available, an experiment opening up, or a feature reaching every workspace. Say who can use it now.

```md
- The **Trace** tab in request details is now available to every workspace ([#3082](https://github.com/phaseoteam/Phaseo/pull/3082)).
- Chat adds an opt-in **Interactive answers** experiment, turned on beside temporary chat.
```

### Fix

Only fixes users could have noticed: wrong numbers, failed actions, broken pages. Say what is right now and what was wrong before.

```md
- Usage overview totals now match the selected date range; before, they counted only a sample of recent requests ([#2921](https://github.com/phaseoteam/Phaseo/pull/2921)).
```

### Removal

```md
- **Deprecated:** The legacy usage export in **Settings -> Usage** is removed on December 1, 2026; use the **Export** button on the Logs page instead.
```

### Desktop and mobile app releases

Only apps people can download. Give the version, the main change and where to get it.

```md
- Phaseo Desktop 1.4 adds Autopilot, which runs saved tasks on a schedule; download it from [Desktop app](/v1/apps/desktop).
```

### Docs site

Only changes to how the docs work, or a new guide that covers a whole topic. Single page edits are not changelog entries.

```md
- New guide: [Broadcast](/v1/guides/broadcast) lists the settings for every trace destination ([#3181](https://github.com/phaseoteam/Phaseo/pull/3181)).
```

## API & SDKs

Gateway and management API behaviour, SDKs, the CLI, the MCP server and integrations such as the Terraform provider.

### New endpoint

Method and path first, then what it does.

```md
- **Beta:** `POST /v1/rate-limits` creates rate limit policies that can be assigned to keys, members and end users; see [Rate Limits](/v1/api-reference/limits) ([#2888](https://github.com/phaseoteam/Phaseo/pull/2888)).
```

### New parameter, field or header

Name the endpoint, then the field and what it does.

```md
- `GET /v1/models` returns an `ETag` and answers `304 Not Modified` to a matching `If-None-Match`; see [List models](/v1/api-reference/endpoint/models) ([#2916](https://github.com/phaseoteam/Phaseo/pull/2916)).
```

### Behaviour change

A change in status codes, errors, routing or defaults that doesn't break working code. Say the new behaviour and the case it applies to.

```md
- A request that every provider rejected with `429` now returns `429` with the provider's `Retry-After` ([#2990](https://github.com/phaseoteam/Phaseo/pull/2990)).
```

### Breaking change

Say what changed, who is affected and what to do. If it takes effect later, give the date.

```md
- **Breaking:** `usage.cost` is now a number in USD instead of a string; parse it as a number.
```

### Limits and billing behaviour

Give the numbers and the status code people will see.

```md
- Rate limit policies enforce `tokens_per_minute` and return `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens` headers; see [Rate Limits](/v1/api-reference/limits) ([#2961](https://github.com/phaseoteam/Phaseo/pull/2961)).
```

### SDK, CLI, MCP and integration releases

Package and version in code, then the main change. One bullet when several SDKs release the same change together. Link the release notes when they exist.

```md
- The TypeScript and Python SDKs `2.4.0` accept `storage_locations` when creating keys ([#3164](https://github.com/phaseoteam/Phaseo/pull/3164)).
- The Terraform provider adds `phaseo_rate_limit_policy` and `phaseo_department_budget` resources ([#3216](https://github.com/phaseoteam/Phaseo/pull/3216)).
```

### Deprecation

```md
- **Deprecated:** The `x-phaseo-provider` request header stops working on January 15, 2027; set `provider.order` in the body instead; see [Routing and Fallbacks](/v1/guides/routing-and-fallbacks).
```

## Models

New models, routes, prices and retirements. Every bullet starts with the model link: `[Provider: Model Name](https://phaseo.app/models/<org>/<id>)`.

### New model

Release artwork first when it exists, then the link. Add one short clause only when there is something a reader needs that the name doesn't say, such as a free period or an unusual price.

```md
![Claude Haiku 5.5 model release artwork](/images/model-releases/2026-10-07--anthropic--claude-haiku-5.5.png)

- [Anthropic: Claude Haiku 5.5](https://phaseo.app/models/anthropic/claude-haiku-5.5)
```

### Model family

One Models section, one artwork for the family if there is one, one bullet per model, largest first.

```md
- [OpenAI: GPT-6.1 Terra](https://phaseo.app/models/openai/gpt-6.1-terra)
- [OpenAI: GPT-6.1 Terra Mini](https://phaseo.app/models/openai/gpt-6.1-terra-mini)
```

### New provider route for an existing model

```md
- [Anthropic: Claude Sonnet 5.5](https://phaseo.app/models/anthropic/claude-sonnet-5.5) is now also served by Google Vertex.
```

### A new provider

List it once, with the models it brings, in the Models section.

```md
- Alibaba Cloud is now a provider, serving [Qwen: Qwen 3.8 Max](https://phaseo.app/models/qwen/qwen-3.8-max) and 12 other Qwen models.
```

### Price change

New price, old price, and when it changed if not on the entry's date.

```md
- [Google: Gemini 4 Argon](https://phaseo.app/models/google/gemini-4-argon) now costs $4 input and $20 output per million tokens (was $5 and $25).
```

### Free or promotional period

Always give the end date and time in UTC.

```md
- [Base Labs: Mammoth](https://phaseo.app/models/baselabs/mammoth) is free until October 28, 2026, 06:59 UTC.
```

### Deprecation announced

Retirement date, what happens to requests afterwards, and the replacement.

```md
- **Deprecated:** [OpenAI: GPT-5.4](https://phaseo.app/models/openai/gpt-5.4) retires on December 1, 2026. After that, requests return `410 model_retired` unless retired model routing is on; the replacement is [OpenAI: GPT-6.1 Terra](https://phaseo.app/models/openai/gpt-6.1-terra).
```

### Retirement

```md
- [OpenAI: GPT-5.4](https://phaseo.app/models/openai/gpt-5.4) is retired; see [Model Deprecation and Retirement](/v1/guides/model-retirement).
```

### Stealth models and reveals

Announce the stealth model as it is listed. When it is revealed, add a bullet on the reveal date; don't rewrite the earlier entry.

```md
- [Stealth: Ox Alpha](https://phaseo.app/models/stealth/ox-alpha) is revealed as [Z.AI: GLM-5.3-Flash](https://phaseo.app/models/zai/glm-5.3-flash) and retired.
```

### Rename or new model ID

Say whether the old ID keeps working.

```md
- [Meta: Muse Wonder 1.0](https://phaseo.app/models/meta/muse-wonder-1.0) is the new ID for `meta/muse-wonder`; the old ID keeps working.
```

## Not changelog entries

- Outages and incidents: they belong on the status page.
- Catalogue data fixes, benchmark syncs and description edits that don't change what a model can do.
- Refactors, performance work nobody would notice, tests, CI, dependency updates and internal tools.
- Anything a customer cannot use yet.

## Before you finish

- Read each bullet aloud. If it needs the PR to make sense, rewrite it.
- Each bullet has the right marker, or none.
- Every docs link points to a page that exists, and every model link to a model page.
- Prices, dates and versions match the source.
