# AI Stats Product Docs Style Guide

## Primary Goal

Help a customer ship something faster.

Every page should answer:
- what this helps me do
- when I should use it
- what I need to copy, run, or change next

## Voice

Write like product documentation:
- direct
- practical
- calm
- specific

Avoid:
- architecture-review voice
- internal platform shorthand
- defensive engineering commentary
- unexplained gateway jargon

## Recommended Page Shape

1. Short outcome-led intro
2. What the reader will build, run, or learn
3. Step-by-step implementation
4. Optional advanced notes
5. Related guides

## Good Patterns

- `Use this guide to ship your first request in a few minutes.`
- `Start here if you want a small browser chat app with the API key kept on the server.`
- `Choose this recipe when you want the cheapest available provider for the same model.`
- `If you only need a smoke test, use the Node example instead.`

## Phrases To Avoid Or Replace

- `request shape` -> `request`, `payload`, or `example request`
- `gateway contract` -> `server-side API call`, `server route`, or remove entirely
- `virtual model id` -> `shared model alias` or explain plainly
- `provider pool` -> `available providers`
- `surface` -> `endpoint`, `route`, or `feature`
- `diagnostics` -> `details`, `request details`, or `debug information`
- `eligible` -> `available`, `supported`, or `matches`
- `concrete model` -> `the exact model used`

## Outcome-First Introductions

The first 2-3 sentences should tell the user:
- what they are about to do
- who this page is for
- what tradeoff the page optimizes for

Bad:
- `This recipe is for teams that want the shortest route from zero to a usable integration.`

Better:
- `Use this recipe to get your first AI Stats request running without choosing a paid model yet.`

## Code Example Rules

- Put the most useful example first.
- Keep samples small.
- Explain what to look for in the response.
- Do not narrate obvious code.
- For generic request examples in docs, prefer a `CodeGroup` with:
  - `cURL`
  - `TypeScript`
  - `Python`
  - `Go`
  - `C#`
  - `PHP`
  - `Ruby`
- Add `Java` too when the SDK page already documents the same workflow cleanly.
- If a cookbook is intentionally language-specific, keep it focused instead of forcing every language into it.
- For Node package installs, prefer a `CodeGroup` with:
  - `npm`
  - `pnpm`
  - `yarn`
  - `bun`

## Advanced Detail

Keep advanced detail, but move it lower.

Good lower-page topics:
- how routing works
- how logging or request details help debugging
- why a sample uses one endpoint over another
- how to swap to another SDK later

## Final Check

Before finishing, ask:
- can a new customer understand the value of this page from the title and intro alone?
- does the page tell them what to do next?
- did we keep the important warnings and technical truth?
