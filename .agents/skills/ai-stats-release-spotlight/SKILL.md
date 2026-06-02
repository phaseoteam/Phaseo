---
name: ai-stats-release-spotlight
description: Write AI Stats release spotlight posts and monthly shipping recaps from merged pull requests, changelog entries, and release metadata. Use when drafting or rewriting announcement posts such as "What we shipped", "release spotlight", or monthly recap content that needs stronger structure, clearer themes, concise product-facing language, and model-release call-to-actions.
---

# AI Stats Release Spotlight

Write a release spotlight that feels like a polished product update, not a raw changelog dump.

Use this skill for monthly recap posts, launch roundups, or "what shipped" announcements that need to summarize many changes without becoming exhaustive.

## Workflow

1. Build a source-of-truth list first.
- Pull merged PRs, existing product or SDK or data changelog entries, and known release dates before drafting.
- Reconcile relative dates against exact dates.
- Treat model additions, SDK launches, and product improvements as separate buckets before combining them into themes.

2. Group changes into a few strong themes.
- Lead with the biggest product or platform changes.
- Keep model releases in their own section unless a specific launch dominated the month.
- Fold small fixes into a closing cleanup or reliability section instead of listing every patch.

3. Write the post like a spotlight, not a ledger.
- Open with a short statement about why the month mattered.
- Use section headings that describe outcomes, not internal implementation.
- Expand important sections into 2-3 short paragraphs when needed.
- Keep supporting lists short and high signal.

4. Use model call-to-actions that read naturally.
- Do not use raw path text such as `/models` as the visible link label.
- Prefer labels such as `Explore models here`, `Explore recent updates here`, or `Browse the latest releases`.
- Use `/updates` for update browsing and `/models` for model discovery, but keep the link text reader-friendly.

5. Keep the scope honest.
- Do not claim a launch was shipped in the month unless it can be tied to a merged PR, changelog entry, or release record.
- If a model date was inferred from public availability, state that in the data changelog, not necessarily in the spotlight post.
- Avoid inflated counts unless they were actually computed.

6. Finish with a compact snapshot.
- Include a small shipping stats section when counts are trustworthy.
- Close with a short "next up" or forward-looking line.

## Output Shape

Use this default structure unless the month clearly needs a custom arc:

1. Title and description
2. One-paragraph intro with exact month range
3. `## What Shipped`
4. 4-6 thematic sections
5. Model-release section with friendly CTAs
6. `## Shipping Snapshot`
7. `## Next Up`

## Writing Rules

- Prefer concrete product outcomes over internal system wording.
- Keep paragraphs short.
- Use bullets only when the content is actually list-shaped.
- Do not restate the same change in three different sections.
- Do not let model additions overwhelm the whole post unless the month was primarily about releases.
- Preserve dates, model names, package names, and endpoint names exactly.

## Required Reference

Read `references/spotlight-format.md` before drafting or rewriting a spotlight post.

## Validation

- Check that the intro names the exact month range.
- Check that each major section reflects real merged work.
- Check that model links use friendly text instead of raw paths.
- Check that the post reads like a recap someone would actually want to read, not a stitched list of PR titles.
