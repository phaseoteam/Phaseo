# Phaseo Changelog Format

## Entry pattern

```mdx
<Update label="October 24, 2026" tags={["Product"]} rss={{ title: "October 24, 2026: Product" }}>

- Short product change, with a [docs link](./guides/example.mdx).
- Another product change.

</Update>

<Update label="October 24, 2026" tags={["API & SDKs"]} rss={{ title: "October 24, 2026: API & SDKs" }}>

- New request parameter or SDK release.

</Update>

<Update label="October 24, 2026" tags={["Models"]} rss={{ title: "October 24, 2026: Models" }}>

![Model name model release artwork](../images/model-releases/2026-10-24--provider--model.png)

- [Provider: Model Name](https://phaseo.app/models/provider/model-id)

</Update>
```

Rules:
- `label` is the date only, in the page language's date format (`October 24, 2026`, `24 octobre 2026`, `2026年10月24日`, ...).
- `tags` holds exactly one category tag (see the table in `SKILL.md`).
- `rss.title` is `<label>: <tag>`, so feed readers can tell same-day entries apart.
- No `##`/`###` headings and no styled `<p>` labels inside or between updates. The tag already names the category.
- No `***` separators.
- Image paths are relative: `../images/...` from `changelog.mdx`, and `../../images/...` from `changelog/*.mdx`. On locale pages, add one more `../`, or use the absolute `/images/...`.

## Models entries

- One bullet per model, written as `[Provider: Model Name](https://phaseo.app/models/<org>/<id>)`.
- Put one release artwork image first when it exists.
- Pricing or provider coverage notes go after the link, in the same bullet.

## Product and API & SDKs entries

- Start with what changed for the user: "Chat can now ...", "`POST /v1/...` accepts ...", "The Python SDK 2.4 adds ...".
- Add where to find it (settings path, page) and a docs link if there is one.
- Use one bullet per change. Merge related PRs into one bullet.

## Checklist

- Each `<Update>` has exactly one valid tag.
- No more than one `<Update>` per (date, tag), newest date first.
- No PR-title phrasing and no internal names.
- Locale pages match the English page block for block.
