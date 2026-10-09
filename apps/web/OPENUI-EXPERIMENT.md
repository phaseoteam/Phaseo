# OpenUI chat experiment

Worktree: `E:\phaseo-worktrees\openui-chat-experiment-20261008`
Branch: `experiment/openui-chat-20261008`

## Start

From this worktree:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @phaseo/web dev --port 3100
```

Local web environment configuration was copied from the main checkout into the
ignored `apps/web/.env.local`. No secrets are committed. If 3100 is occupied, use
port 3101. The existing development web API configuration applies.

## Try without a model

Open <http://localhost:3100/experiments/openui>. The fixture preview offers a
comparison, table, bar chart, editable follow-up form, negative/zero values,
malformed output, and ordinary Markdown. Replay streaming; inputs stay disabled
until completion. Type a value, switch examples, and reload to check persistence.
Submit to see the exact user message without making a model call.

## Try in chat

Open <http://localhost:3100/chat>, sign in as usual, and create/select a chat and
model. Turn on **Interactive answers** in the header beside temporary chat. The toggle
is saved per chat and applies to subsequent generations. These are normal Phaseo
requests with normal usage/billing. Nothing has been deployed.

Example prompts:

- “Compare hosting a personal project on a VPS versus a managed platform. Show
  comparison cards and a table, then ask about my budget with a form.”
- “Use these fictional monthly sales figures: January 12, February 18, March 9.
  Show a bar chart and table, clearly labelled as fictional data.”
- “Explain the difference between these options, then ask which one I prefer.”
- “What is 2 + 2?” (ordinary Markdown is allowed for simple responses).

Check a form submission creates a normal user turn, regenerate and switch variants,
reload, branch the conversation, try mobile width and keyboard navigation, and
toggle the experiment off. Existing interactive messages should still render and
retain their own form values. In long chats, scroll away and back to verify values
survive virtualization.

## Scope and limitations

- Uses `@openuidev/react-lang` with a curated Phaseo component library and the
  existing Responses request/streaming path. Ordinary messages use Streamdown.
- Component props are checked again before rendering. Text renders as text; no
  model-supplied HTML, URLs, arbitrary tools, or executable components are exposed.
- Form state belongs to the response variant, lives in existing local chat
  storage, and is included as data in the next model turn. Forms are disabled while
  any request is sending. Temporary chats retain their existing temporary behavior.
- Malformed output shows a retry notice when parsing fails. The experiment has
  no automatic correction request. Different models will vary in format adherence.
- No Thesys gateway, image search, maps, geocoding, or new API/database contracts.
  OpenUI observability publication and automatic CDN devtools are disabled.
- The new OpenUI packages have a scoped exception to the repo's seven-day release
  hold, confined to this experiment branch. Review before production adoption.

Sources: [Open Intelligent UI demo](https://github.com/thesysdev/open-intelligent-ui),
[OpenUI React runtime](https://github.com/thesysdev/openui/tree/main/packages/react-lang).

## Validation

- Nine deterministic tests pass (fixtures, streaming parser, bounds, follow-ups,
  and state isolation between variants):
  `pnpm --filter @phaseo/web exec jest --runInBand --runTestsByPath "src/components/(chat)/openui/openuiHelpers.test.ts" "src/components/(chat)/openui/openuiLibrary.test.tsx"`.
- `pnpm --filter @phaseo/web typecheck` and `pnpm --filter @phaseo/web build` pass.
  The build reports existing help-content bundling warnings and a catalog sitemap
  fetch returning 503; it still completes successfully.
- Browser checks cover mobile layout, keyboard submit, fixture state after reload,
  streaming input disabling, malformed output, Markdown, and the chat toggle.
- Scoped ESLint passes with `--rule "react/no-unescaped-entities: off"`; that
  existing React rule crashes under ESLint 10 on multiline JSX. No lint
  configuration was changed. Earlier lint of the changed chat files reported
  existing warnings only.
- Live authenticated generation, regeneration, and long-chat virtualization need
  user testing; no paid model calls were made.
- A broader test invocation encountered unrelated existing React Markdown ESM
  and dashboard Jest module mapping failures. The focused tests above are green.
