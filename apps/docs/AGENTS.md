# Documentation Overrides

These instructions apply to `apps/docs` and extend the repository-level `AGENTS.md`.

## Mintlify Structure

- The documentation site uses Mintlify. Pages are Markdown/MDX under `v1`; navigation, redirects, tabs, and API-reference configuration live in `docs.json`.
- Place a page in the existing information architecture before adding it to navigation. Reuse established MDX components and frontmatter conventions.
- Use concise task-oriented titles, descriptive headings, and copy-pasteable examples. Explain prerequisites and expected results before edge cases.
- Prefer links to canonical pages over repeating the same explanation in multiple sections.
- Avoid sparkles and wand-sparkles icons. Choose an icon that describes the page's task or content.
- Before adding a page, identify its distinct user task or reference lookup and why an existing page cannot cover it. A short working example or endpoint reference can justify a page; a repeated introduction or a list of links alone usually cannot.
- Keep one canonical guide per topic across the Docs and API Reference tabs. Link to it from both tabs instead of maintaining duplicate explanations. Consolidate adjacent short pages when readers need all of them to complete one task.

## Public Contract and Generated Surfaces

- `openapi/v1/openapi.yaml` is the single v1 contract used by both Mintlify and SDK generation. Do not create a filtered public copy. Mark internal operations with both `x-internal: true` and Mintlify's `x-excluded: true`; document preview operations with Beta labels and retain their API access gates.
- Endpoint pages must name their spec file: `openapi: "/openapi/v1/openapi.yaml POST /chat/completions"` in English, `/<locale>/openapi/v1/openapi.localized.yaml` in translations. A bare `POST /chat/completions` resolves to the alphabetically first spec defining it, which is a localized one, so English pages render translated text. `validate:locales` enforces this.
- SDK reference pages must match the current handwritten wrappers and generated operations for their language. Do not claim convenience helpers or parity that the package does not provide.
- When an API contract changes, update the OpenAPI document, affected guides/examples, generated SDKs, and language reference pages together.
- Do not manually patch generated SDK source to make a documentation example true; fix the specification or handwritten wrapper and regenerate.

## Validation

- Link check: `pnpm docs:links`
- Mintlify validation/build: `pnpm docs:build`
- Run both for navigation changes, renamed pages, API-reference changes, or broad link edits.
- Verify code examples use current Phaseo URLs, model IDs, SDK package names, and authentication conventions. Never include real keys or production customer data.
- Preserve redirects when moving published pages and update inbound links in the same change.
- Translated pages (`<locale>/v1`) must translate all English prose and keep its structure: the same headings, components, tables, and lists, with code blocks, inline code, URLs, identifiers, product names, and third-party UI labels unchanged. Do not summarize a page or link readers to the English version instead. See `TRANSLATION_WORKFLOW.md` for recording reviewed translations.

## Agent-Facing Content

- Site-wide guidance for agents lives in `docs.json` `markdown.instructions`. Mintlify adds it to every page's Markdown, `llms.txt`, and `llms-full.txt`. Keep it short and factual, and update it when the base URL, auth header, model ID format, or SDK names change.
- Public skills are published from `.agents/skills` to `.mintlify/skills` (and to the Phaseo plugin) by `pnpm skills:sync` at the repository root; `docs:build` fails if the copies drift (`skills:check`). Edit skills in `.agents/skills`, never in `.mintlify/skills`, add a new public skill to `scripts/skills/public-skills.mjs`, and run `pnpm skills:validate`. `.agents/skills/README.md` has the authoring rules.
- Use `<Prompt>` (with `actions={["copy", "cursor"]}`) for prompts readers paste into coding agents. Prompt bodies stay in English in every language; translate the `description`.
- Use `<Visibility for="agents">` for short, factual rules that only agents need, taken from the page itself. Translate them like any other prose.
- Mermaid node IDs must not be Mermaid keywords (`call`, `click`, `end`, `style`, `class`); give question nodes the compact `{{"..."}}` shape.

## Page Shape and Voice

The reference pages are `guides/how-providers-earn-traffic.mdx` and `guides/provider-statuses.mdx`: one plain sentence of what the feature does, a visual that shows it working, then short sections a reader can scan.

- **Open with the job, not the feature.** The first sentence says what the reader can do and how (`Set stream: true to…`). No "X lets you…", "This guide covers…", or restating the title.
- **Show before you tell.** Put the main visual or the first working request near the top. Pick the lightest visual that shows the mechanism:
  - a table when readers compare options or look up values;
  - a Mermaid flowchart when the order of decisions matters;
  - `<CodeGroup>` for the same request in several languages, `<Steps>` for a procedure;
  - an interactive snippet (`/snippets/*.jsx`) when the reader learns by changing an input and watching the result, such as rankings, merges, fallbacks, or event streams.
- **One idea per section.** Headings are tasks or questions (`Recover from an interrupted stream`), not labels (`Contract notes`, `Current public surface`).
- **Cut filler.** Delete sentences that sell the feature, justify a design ("intentionally explicit", "not a cosmetic label"), repeat an earlier list, or describe internals the reader can't act on. Don't add "When to use", "Key benefits", or "Related guides" link lists; link inline where the reader needs the next page.
- **Prefer short paragraphs to long bullet lists.** Use a list only for parallel items; give each item a bold lead-in when the list is longer than four.
- **Say exactly what happens.** Name the field, status code, dashboard path, and CLI command. Write limits as numbers. Don't hedge ("can", "may", "generally") unless behaviour really varies, and then say on what.
- **Claims come from the code.** When a rewrite states behaviour, check it in `apps/api` (or the web app) and name the source file in the snippet header comment. Don't add behaviour a page didn't already document without checking it.

### Interactive snippets

- One component per file in `snippets/`, exported with a `{ locale }` prop. Every visible string lives in a `…Labels` object, with a `…Locales` map for translations, as in `routing-cost.jsx`.
- Use `useState`/`useEffect` directly; Mintlify provides them. Don't import packages.
- Style with a `.ph-<prefix>` class block in `styles.css`. Reuse the shared `--x-*` tokens (light and `.dark`), keep corners at `0.375rem`, and keep numbers, model IDs, and code left-to-right on RTL pages.
- Examples use realistic Phaseo model and provider IDs, but make clear when numbers are illustrative.
- The page must still make sense if the snippet fails to load: state the rule in prose next to it.

## Writing and Safety

- Separate conceptual explanation, procedures, reference material, and troubleshooting rather than mixing all four into one page.
- State whether examples are production-ready, illustrative, preview-only, or require live-provider credentials.
- Treat tool-calling, redirects, uploads, webhooks, and model-generated arguments as security-sensitive topics; include safe defaults and validation guidance.
- Add changelog entries only for user-visible shipped behavior, and keep historical statements historically accurate.
