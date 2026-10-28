# Phaseo Changelog Format

## Page pattern

Every changelog page starts, after the frontmatter, with the filter bar. Its labels are the page language's category labels (see the table in `SKILL.md`), and `clearLabel` is the word for "Clear":

```mdx
import { ChangelogFilters } from "/snippets/changelog-filters.jsx";

<ChangelogFilters labels={{"product":"Product","api":"API & SDKs","models":"Models"}} clearLabel="Clear" />
```

| | en | es | fr | de | pt-BR | ja | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|---|
| `clearLabel` | Clear | Borrar | Effacer | Zurücksetzen | Limpar | クリア | 清除 | साफ़ करें | مسح |

Then one `<Update>` per date, newest first:

```mdx
<Update label="October 24, 2026">

<div data-changelog-category="product">

<p className="changelog-category">Product</p>

- Short product change; see [Broadcast](/v1/guides/broadcast).
- Another product change.

</div>

<div data-changelog-category="api">

<p className="changelog-category">API & SDKs</p>

- New request parameter or SDK release.

</div>

<div data-changelog-category="models">

<p className="changelog-category">Models</p>

![Model name model release artwork](/images/model-releases/2026-10-24--provider--model.png)

- [Provider: Model Name](https://phaseo.app/models/provider/model-id)

</div>

</Update>
```

Rules:
- `label` is the date only, in the page language's date format (`October 24, 2026`, `24 octobre 2026`, `2026年10月24日`, ...). No `tags`, `description` or `rss` attributes.
- One `<Update>` per date. Add to an existing date instead of starting a second one.
- Sections in the order product, api, models, each at most once. Leave out empty ones.
- Each section starts with `<p className="changelog-category">` holding the localized label, and nothing sits in an update outside a section.
- Keep the blank lines exactly as shown: Mintlify only renders Markdown inside a `<div>` when it is separated by blank lines.
- No `##`/`###` headings and no `***` separators.
- Image paths: either relative (`../images/...` from `changelog.mdx`, `../../images/...` from `changelog/*.mdx`, one more `../` on locale pages) or root-absolute `/images/...`, which works everywhere.

## Models entries

- One bullet per model, written as `[Provider: Model Name](https://phaseo.app/models/<org>/<id>)`.
- Put one release artwork image first when it exists.
- Pricing or provider coverage notes go after the link, in the same bullet.

## Product and API & SDKs entries

Follow `writing-guide.md` for each kind of entry.

## Checklist

- `node apps/docs/scripts/validate-changelog.mjs` passes.
- No PR-title phrasing and no internal names.
- Locale pages match the English page date for date and section for section.
