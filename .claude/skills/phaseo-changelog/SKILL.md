---
name: phaseo-changelog
description: Writes Phaseo changelog entries in the right category, format and wording, and keeps every changelog page and its 8 translations valid. Use whenever something shipped needs announcing (a feature, setting, fix users noticed, API or SDK change, breaking change, deprecation, model release, price change or retirement), when backfilling a month from merged PRs, when starting a new month's page, when editing apps/docs/v1/changelog.mdx or apps/docs/v1/changelog/*.mdx, or when checking changelog pages.
---

# Phaseo Changelog

The changelog is a clean release log: product changes, API and SDK changes, and model releases. It is not a blog and not a dump of PR titles.

## Pages

- `apps/docs/v1/changelog.mdx`: the current month. It has `rss: true` in frontmatter.
- `apps/docs/v1/changelog/YYYY-MM.mdx`: earlier 2026 months. `apps/docs/v1/changelog/YYYY.mdx`: 2025 and earlier.
- Every page has a copy in each locale: `apps/docs/<locale>/v1/...` for `es`, `fr`, `de`, `pt-BR`, `ja`, `zh-Hans`, `hi`, `ar`.
- When a month ends, move its entries into `changelog/YYYY-MM.mdx`, add that page to the Changelog tab in `docs.json` (all 9 languages), and start the next month in `changelog.mdx`.

## How filtering works (why the format is strict)

Mintlify turns `tags` on `<Update>` into filters in the right-hand panel, which replace the table of contents.
- A filter shows or hides whole `<Update>` blocks, never single bullets.
- Selecting several tags shows only updates that have every selected tag.
- Updates without tags are hidden whenever a filter is active.
- Filters only apply to the page you are on.

So each `<Update>` holds one category and has exactly one tag. A day with product work and new models gets two `<Update>` blocks with the same date label.

## Tags

Use only these three tags. Use the localized name on locale pages:

| Category | en | es | fr | de | pt-BR | ja | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|---|
| Product | Product | Producto | Produit | Produkt | Produto | 製品 | 产品 | उत्पाद | المنتج |
| API & SDKs | API & SDKs | API y SDK | API et SDK | API & SDKs | API e SDKs | API と SDK | API 与 SDK | API और SDK | API وحزم SDK |
| Models | Models | Modelos | Modèles | Modelle | Modelos | モデル | 模型 | मॉडल | النماذج |

On a given day, write them in this order: Product, API & SDKs, Models.

- **Product**: anything people use in phaseo.app or the apps, including Chat, dashboard, settings, billing and credits, workspaces and teams, the models/providers/compare pages, docs-site features, and the desktop and mobile apps.
- **API & SDKs**: gateway and management API behaviour such as new endpoints, parameters, headers, routing and limits, plus SDK, CLI, MCP server and integration releases.
- **Models**: new models, model state changes, provider coverage for a specific model, model pricing changes, retirements, and release artwork.

When an item could fit two categories, choose the one where a reader would look for it. A new model in Chat is Models. A new Chat feature built for one model is Product.

## Workflow

1. Build the source list first: merged PRs for the period (`gh pr list --state merged --search "merged:YYYY-MM-DD..YYYY-MM-DD"`), release records, and any existing entries.
2. Keep only changes users can see that have shipped. Skip refactors, tests, CI, dependency bumps, internal tooling, reverted work, and anything still behind an internal flag. Check that a feature reached users before dating it.
3. Use the merge date (UTC), or the launch date if it is known and differs.
4. Merge each day into at most one `<Update>` per category.
5. Write the English page, then update all 8 locale pages with the same dates, tags and links. Then record freshness for each page (see Validation).

## Writing

`references/writing-guide.md` says how to write each kind of announcement. In short:
- One change per bullet, one sentence of at most about 25 words, outcome first, then `; see [Docs page](/v1/...)` and up to three PR links.
- Start with `**Breaking:**`, `**Beta:**` or `**Deprecated:**` when it applies, and say what to do or by when.
- Include fixes only when users could have noticed the bug.
- No marketing language, no "SOTA", no competitor names, and nothing customers cannot use yet.
- Keep historical statements historically accurate.

## Required references

Read both before drafting:
- `references/changelog-format.md`: blocks, tags, labels and images.
- `references/writing-guide.md`: how to write each kind of entry.

## Validation

- Every `<Update>` has exactly one tag from the table.
- Never more than one `<Update>` per (date, tag) on a page. Dates run newest first.
- Locale pages have the same blocks, dates and tags as English.
- Record each changed locale page: `node scripts/translation-freshness.mjs record --locale <l> --page changelog/<file>.mdx` (one `--page` per run, from `apps/docs`).
- Then run `node scripts/translation-freshness.mjs check` and `node scripts/validate-locales.mjs`.
