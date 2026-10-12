# Desktop orchestration

## Change brief

Build T3 Code-style orchestration inside the existing Phaseo desktop shell, preserving Phaseo branding, connected accounts and gateway model selection. Reference: T3 Code nightly `v0.0.46-nightly.20261005.2676`, commit `7812230572f2d7e042d8d14ada2381fc71377560`, especially its orchestration V2 MCP and thread lineage documents. Its MIT licence permits reuse with attribution; this implementation initially uses the documented behaviour rather than copying source.

Implement a shared, scoped thread service over the existing SQLite store and provider runtime. A delegated child has its own prompt, model, account and durable history. It inherits the parent's project and permission ceiling. Agents cannot approve permissions or inspect unrelated conversations. Retry identifiers prevent duplicate children. Waiting is bounded and cancellation and shutdown release waits. Completion delivery must be durable and idempotent before background parent wake-up is enabled.

Acceptance: deterministic provider fixtures verify cross-harness child execution, isolation, duplicate requests, cancellation, wait timeout and restart recovery. Renderer checks cover thread references, child tracking and existing composer behaviour. No paid inference is used for validation. No production deployment or account migration is part of this change.

## Parity ledger

Keep these separate from the broader desktop feature ledger; an exposed tool alone does not establish parity.

- [x] Scoped thread read/list/title-search tools; bounded context reads
- [x] Cross-model delegation and durable parent/child lineage
- [x] Parent waiting and cancellation propagation
- [x] Durable background result delivery and parent wake-up
- [x] Composer thread references and sidebar drag references
- [x] Child status and result UI
- [x] Phaseo direct tools, Codex/Claude/Cursor/ACP/Grok MCP configuration and Pi extension bridge (fixture validation)
- [ ] OpenCode session isolation and live provider-specific orchestration verification
- [ ] Native subagent observation
- [x] Message-boundary forks, child messaging and idempotent conversation-result merge
- [ ] Full provider handoff and Git worktree merge-back tools
- [ ] Project, worktree, scheduling and preview tools
- [ ] Full latest-nightly parity audit

## Validation and limits

The reference clone lives in ignored `.tmp/t3code-orchestrator-reference`. Source and licence were inspected; no T3 implementation code or branding was copied into this increment.

Orchestration uses the existing model discovery functions. Catalogs are bounded in tool responses and cached for ten minutes with stale results returned during background revalidation. Delegation validates the selected model when the desktop discovery service is available. Account secrets and invocation bearer tokens are never saved as workspace MCP connections.

Owned child chats have a return-to-parent footer, remain visible through their parent and are excluded from ordinary chat history. Native-provider-owned subagents remain a separate missing capability. This increment does not establish full T3 nightly parity.

OpenCode orchestration injection is deliberately not enabled: its MCP configuration is directory-scoped, so injecting one chat's credential could expose it to another session. OpenCode can still execute delegated work, but cannot yet recursively use the desktop orchestration service.

Validation uses temporary profiles, mock model clients and an authenticated local MCP server. No paid inference was performed. The Electron UI audit checks keyboard reference selection, drag references, delivery, child navigation and collapsed results. Real subscription/provider end-to-end orchestration remains unverified.

## Follow-up: child controls

Extend the existing shared service with owned-child rename, steering and queue inspection/edit/removal. Reference the pinned T3 thread management contract. Reuse desktop commands rather than a second execution path. Acceptance: fixtures cover successful durable mutations, queue ordering and rejection of mutations to referenced/unrelated chats. Local-only validation; no paid inference or deployment. Full parity remains pending in the ledger.

Credential lifecycle: bound invocation tokens to an eight-hour maximum and thirty-minute idle lifetime, checked at request and tool execution boundaries. Validate expiry with an injected clock and local HTTP fixtures. Tokens remain memory-only.

Follow-up validation: owned-child rename, provider steering, queue read/edit/remove and invocation lifetime/idle expiry are implemented. The targeted orchestration/runtime/Pi suite passed 27 tests; the additional successful native-steering fixture brings that set to 28. Desktop typecheck, lint and main build passed. These checks use mocked adapters and local HTTP, not paid provider inference.

## Native tracking and handoff brief

Move child tracking to the right Agents pane, preserving existing child navigation and Phaseo tokens. Observe Codex collaboration events and Claude SDK task lifecycle events through owned parent streams; persist bounded read-only state in activities, without reading arbitrary provider files. Add retry-safe scoped provider handoffs using existing portable history transfer, same project and parent permission ceiling. Validate provider event parsers, persistence and handoff isolation with local fixtures; no paid calls, deployment or claims of all-provider parity.

Native tracking now observes Codex collaboration and V2 subAgentActivity events plus Claude local_agent lifecycle events. Read-only observations persist through the activity store and render beside app-owned children in Tools → Agents. Other provider-native formats and subscription end-to-end verification remain pending. Agent-facing handoff creates an idempotent owned continuation with portable conversation context, a fresh native session, model validation, same-project scope and inherited permission ceiling; send_thread begins work. Electron fixtures verify right-pane placement, native details and child navigation.

## Phaseo orchestration and timeline brief

Verify Phaseo gateway agent-loop delegation and result collection using deterministic model responses and the shared scoped service. Fix conversation interleaving by persisting first-observed order for assistant messages and activities, assigned before batched writes; later tool/reasoning updates retain their original place. Preserve legacy history without inventing unavailable event chronology. Validate same-batch text/tool/text, updates, history paging and gateway tool execution. No paid calls or deployment.

Phaseo ordinary Chat now receives the same orchestration descriptors and approval review as its coding path. Mock gateway responses verify delegate_task → wait_thread → final answer in both paths. Timeline first-observed order is assigned synchronously before batched writes, survives status updates and is persisted with message/activity JSON. Legacy entries keep their previous fallback because exact interleaving was not recorded. 34 targeted tests and the Electron ordering/reference/agent-pane audit pass; lint, typecheck and main/renderer builds pass. No paid inference was used.

## Usage presentation cleanup

Remove usage activities from the visible conversation timeline and omit empty Activity groups. Keep stored usage for message information, displaying formatted token totals there rather than raw provider JSON. Preserve tool/thinking activity and historical usage data. Validate timeline filtering and desktop typecheck; no provider calls or data migration.

## Turn disclosure brief

Match the supplied screenshots: stream reasoning visibly during a live turn; after completion collapse intermediate text, reasoning and tools under one Worked for disclosure, leaving the final reply visible. Preserve event order inside the disclosure and group consecutive tool calls. Record actual turn start/end for accurate duration; legacy turns use a plain Worked label rather than inventing timing. Keep paginated partial turns from misidentifying a final reply. Validate grouping and Electron live-to-completed transition with fixtures. No paid calls.

Turn disclosure validation: 22 grouping/timeline/runtime tests pass; Electron fixtures confirm visible live reasoning, automatic completion collapse, duration formatting, final answer outside the disclosure and retained event order. Native observation cards stay in the Agents pane. Lint and typecheck pass; no live inference used.

## Chat sidebar metadata brief

Use supplied sidebar/hover-card references: compact harness logos on both pinned and normal chat rows, with a portalled Base UI preview showing full title, provider, model, project, status and last update. Reuse existing overview metadata and bundled logo assets; do not fetch conversation history on hover. Preserve click/drag/reorder and date/status alignment. Validate desktop types and Electron row navigation/hover fixtures; local UI change only.

Sidebar validation: Electron hover fixture confirms bundled row logos and provider/model/project metadata without a detail request on hover; existing click navigation and composer drag-reference checks still pass. Eighteen store tests, desktop lint/typecheck and main/renderer builds pass.

Sidebar alignment fix: shared title-span rules were also giving span-based logos flex growth, producing large gaps for Phaseo rows. Restrict title growth to non-logo spans and fix logo/image dimensions for all rows and preview cards. Verify rendered logo width and title gap in Electron; preserve row behaviour.

Sidebar logo correction: use model-lab logos rather than harness logos on chat rows. Resolve organisation-prefixed gateway IDs and known native model families; unknown labs keep a neutral icon. Model hover row likewise avoids harness fallback. Preserve harness identity as text metadata. No extra catalog fetches.

Disclosure/shimmer cleanup: unify reasoning and tool-group row padding, typography and trailing chevrons. Follow the pinned T3 live-activity text shimmer pattern for thinking, running tools and Working status; retain readable response text and disable animation for reduced motion. Renderer-only change, validate Electron transition and builds.

Composer paste/focus brief: accept clipboard image files through the existing signature-validated attachment storage and display draft chips, including the new-chat composer. Route unmodified printable typing from the chat background to the composer, excluding inputs, editable surfaces, menus, dialogs, terminals and IME composition. Preserve normal text paste and shortcuts. Validate typecheck and Electron fixture behaviour without inference.

Composer validation: Electron fixtures confirm pasted image bytes reach the attachment bridge, a chip appears, and unfocused printable typing focuses/inserts into the composer. Attachment storage tests, lint, typecheck and main/preload/renderer builds pass. New-chat image drafts are retained until chat creation and can send without text. No inference was used.

Thinking surface correction: remove the inherited result-card background/border from both live and completed reasoning. Render a single tool directly rather than adding a redundant group disclosure; reserve grouping for multiple calls. Validate expanded completed reasoning in Electron as well as live reasoning.
