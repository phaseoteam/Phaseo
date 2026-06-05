---
name: ai-stats-changelog
description: Write and maintain AI Stats changelog pages in the required house style. Use when updating `apps/docs/v1/changelog.mdx`, `product-changelog.mdx`, `sdk-changelog.mdx`, or `data-changelog.mdx`, especially when entries need to be rebuilt from merged pull requests, release metadata, and model-release records.
---

# AI Stats Changelog

Write changelogs as a clean release log, not as a blog post and not as a dump of PR titles.

Use this skill when the task is to add, rewrite, merge, or audit changelog entries across the docs site.

## Workflow

1. Build the source-of-truth list first.
- Pull merged PRs, existing changelog entries, model-release records, and any release assets before drafting.
- Reconcile relative timing against exact dates.
- Split findings into `product`, `sdk`, and `models/data` before writing.

2. Decide which changelog surface you are updating.
- `apps/docs/v1/changelog.mdx`: combined page for date-ordered product and model updates.
- `apps/docs/v1/product-changelog.mdx`: product-only log.
- `apps/docs/v1/sdk-changelog.mdx`: SDK-only log.
- `apps/docs/v1/data-changelog.mdx`: short model and data release log.

3. Group changes by day before writing.
- Use one dated entry per calendar day.
- Do not create duplicate sections for the same date.
- Merge all related model releases for the same day into one `New Models` block.
- Merge all related product and SDK work for the same day into one `Product` block.

4. Keep the buckets honest.
- `Product` means actual product or SDK work.
- `New Models` means model additions, state changes, pricing syncs, provider coverage, and release imagery.
- Do not describe model GA coverage or model-page availability as product work unless there was a separate product feature shipped alongside it.
- Fold SDK launches and SDK version updates into `Product` on the combined page unless the task explicitly asks for a separate SDK label.

5. Keep the writing short.
- Prefer one-line bullets.
- Remove filler intros, release-marketing language, and repeated context.
- Use exact model names, package names, dates, and status labels.
- If an item can be said in one sentence, do not use two.

## Combined Page Rules

For `apps/docs/v1/changelog.mdx`:

- Use date headings in `Month D, YYYY` format as real `##` headings so the page gets a clean date-only TOC.
- Under each date, use only these body labels:
  - `Product`
  - `New Models`
- Keep those labels as styled body text, not real Markdown headings.
- Omit a label entirely if that date has no entries for that bucket.
- Start the page quickly. Do not add a long intro block above the timeline unless explicitly requested.

## Data Changelog Rules

For `apps/docs/v1/data-changelog.mdx`:

- Match the older short-entry style.
- Group releases by day.
- Keep entries compact and factual.
- Use model-release images where they already exist or are clearly available.
- Avoid paragraph-heavy explanations, launch copy, or repeated status framing.

## Product And SDK Rules

For `product-changelog.mdx` and `sdk-changelog.mdx`:

- Write product-facing headings that describe the outcome, not the implementation detail.
- Keep each dated section concise.
- Do not restate the same item across product and data logs in conflicting ways.
- If a model release appears in the product log, it must be because a real product or SDK surface changed, not just because the model exists.

## Required Reference

Read `references/changelog-format.md` before drafting or rewriting entries.

## Validation

- Check that every date appears only once per page.
- Check that model releases are grouped under `New Models`, not `Product`.
- Check that SDK items are folded into `Product` on the combined page unless explicitly separated.
- Check that the combined page TOC remains date-only.
- Check that the data changelog stays short and grouped by day.
- Check that each statement can be tied back to merged work, release metadata, or release records.
