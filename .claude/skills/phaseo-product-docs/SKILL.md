---
name: phaseo-product-docs
description: Rewrite Phaseo documentation in a product-facing voice. Use when docs read like internal engineering notes, architecture commentary, or implementation diagnostics instead of helping customers get a result quickly.
---

# Phaseo Product Docs

Use this skill when Phaseo docs need to sound like product documentation instead of internal integration notes.

## When To Use It

Use this skill for:
- cookbook pages
- quickstarts
- SDK guides
- migration guides
- onboarding pages
- examples pages
- feature overviews

Use it when the page currently:
- leads with system internals instead of user outcomes
- explains how the platform thinks instead of what the user should do
- overuses phrases like `request shape`, `gateway contract`, `provider pool`, `diagnostics`, or `surface`
- reads like release notes, architecture notes, or reviewer commentary

## Workflow

1. Audit the page before rewriting.
- Identify the user goal in one sentence.
- Mark internal-only language that should be removed or pushed lower.
- Decide what the reader should be able to do after reading the page.

2. Rewrite from the top down.
- Lead with the outcome.
- Keep the first paragraph short and concrete.
- Turn setup into steps, not theory.
- Keep code examples close to the step they support.

3. Push technical detail down.
- Keep advanced implementation detail in lower sections such as `How it works`, `Advanced notes`, or `Troubleshooting`.
- Remove internal commentary that does not help a customer ship or debug.

4. Validate the finished page.
- The title should describe the job to be done.
- The introduction should tell the reader what they will build, run, or learn.
- The page should still be technically correct after simplification.

## Rewrite Rules

- Prefer customer language over platform-internal language.
- Prefer verbs and outcomes over taxonomy.
- Keep paragraphs short.
- Use lists for steps, choices, and checks.
- Treat architecture detail as supporting material, not the headline.

## Required Reference

Read `references/style-guide.md` before rewriting more than one page.

## Execution Rules

- Do not change API semantics to make the copy sound nicer.
- Do not remove useful warnings about auth, billing, privacy, or async behavior.
- When a term is necessary, introduce it plainly once and then move on.
- Favor small, high-signal edits over bloated rewrites.
