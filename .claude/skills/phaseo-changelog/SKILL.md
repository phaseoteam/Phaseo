---
name: phaseo-changelog
description: Write and maintain the Phaseo docs changelog (`apps/docs/v1/changelog.mdx` and `apps/docs/v1/changelog/*.mdx`, plus the 8 locale copies) in the tagged `<Update>` format that Mintlify's filters need. Use when adding entries, backfilling product or API/SDK changes from merged PRs, adding model releases, or auditing changelog pages.
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

- One-line bullets that describe the outcome for the user, not how it was built.
- Exact names: model names, settings paths (`**Settings -> Routing -> ...**`), headers, endpoints and package versions.
- Link the relevant docs page or model page when there is one. PR links are optional.
- No marketing language, no "SOTA", and no competitor names.
- Keep historical statements historically accurate.

## Required reference

Read `references/changelog-format.md` before drafting.

## Validation

- Every `<Update>` has exactly one tag from the table.
- Never more than one `<Update>` per (date, tag) on a page. Dates run newest first.
- Locale pages have the same blocks, dates and tags as English.
- Record each changed locale page: `node scripts/translation-freshness.mjs record --locale <l> --page changelog/<file>.mdx` (one `--page` per run, from `apps/docs`).
- Then run `node scripts/translation-freshness.mjs check` and `node scripts/validate-locales.mjs`.
