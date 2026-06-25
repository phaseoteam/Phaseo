# AI Stats Changelog Format

## Combined Changelog

Use this pattern for `apps/docs/v1/changelog.mdx`:

```mdx
## May 28, 2026

<p style={{ fontSize: "1rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.5rem" }}>Product</p>

- Short product or SDK change.
- Another short product or SDK change.

<p style={{ fontSize: "1rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.5rem" }}>New Models</p>

- Model release or pricing sync.
- Another model release.

***
```

Rules:
- Use `##` for the date only.
- Do not use `### Product` or `### New Models`.
- Do not repeat `Product` twice under the same date.
- Do not repeat `New Models` twice under the same date.

## Data Changelog

Keep it short:

```md
## 15th May 2026

- Claude Opus 4.8 was added.
- Gemini 3.1 Flash Image and Gemini 3 Pro Image were added.
```

Rules:
- One date block per day.
- Short factual bullets only.
- Merge same-day releases into one block.
- Add release images only where they are available and useful.

## Classification Rules

Put an item under `Product` when it is about:
- UI changes
- docs-site behavior
- pricing selector or provider display logic
- SDK launches or SDK releases
- gateway, billing, routing, settings, or dashboard features

Put an item under `New Models` when it is about:
- model additions
- model status changes such as `Announced` or `Available`
- pricing syncs tied to a model
- provider coverage for a specific model
- model-release image additions

Do not misclassify:
- A model becoming generally available on tracked providers is still a model update.
- A page refresh made to better display a provider or price is a product update.

## Editing Checklist

- The page should scan quickly from top to bottom.
- The right rail TOC on the combined page should show dates only.
- No duplicate date headings.
- No raw PR-title phrasing.
- No long intro block unless the user explicitly wants one.
