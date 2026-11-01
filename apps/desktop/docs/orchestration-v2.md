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
- [x] Orchestration tools in Chat, Plan and Code for every MCP-capable harness, with shared orchestration instructions
- [x] One-call agent catalog (`list_agents`), account auto-pick, workspace agent limit and privilege ceiling
- [x] Batched result delivery, launch wake and upgrade-to-always-wake for abandoned waits (fixture validation)
- [x] OpenCode orchestration on a service of its own per turn (fixture validation; not run against a live OpenCode 2 service)
- [ ] Live provider-specific orchestration verification
- [ ] Native subagent observation
- [x] Message-boundary forks, child messaging and idempotent conversation-result merge
- [ ] Full provider handoff and Git worktree merge-back tools
- [x] Top-level chat launch (single and batch) with workspace strategies including new Git worktrees, project listing, chat organisation and scheduled-task tools (fixture validation)
- [x] Browser tools for agents: open, read, click, type, act (hover, select, key press, scroll, drag, upload), evaluate, wait, resize, colour scheme, dialogs, recording, close and screenshots (fixture validation)
- [ ] Full latest-nightly parity audit

## Validation and limits

The reference clone lives in ignored `.tmp/t3code-orchestrator-reference`. Source and licence were inspected; no T3 implementation code or branding was copied into this increment.

Orchestration uses the existing model discovery functions. Catalogs are bounded in tool responses and cached for ten minutes with stale results returned during background revalidation. Delegation validates the selected model when the desktop discovery service is available. Account secrets and invocation bearer tokens are never saved as workspace MCP connections.

Owned child chats have a return-to-parent footer, remain visible through their parent and are excluded from ordinary chat history. Native-provider-owned subagents remain a separate missing capability. This increment does not establish full T3 nightly parity.

OpenCode keeps MCP servers added at runtime per folder, for every session on that service, so adding a chat's orchestration credential to the shared service (or to the person's own, which Phaseo reuses when it runs) would expose it to other sessions in the folder. In Plan and Code, an OpenCode turn with the orchestration server instead starts a service of its own (`OpenCodeService.isolated`: `serve --service` on a random localhost port, with its own state folder), adds the orchestration server and the workspace's MCP connections there, and stops it when the turn ends. Sessions live in OpenCode's shared data folder, so a chat resumes on any service. The shared service never receives an orchestration connection. OpenCode sessions take no system prompt, so a new session gets the orchestration guidance ahead of its first prompt, as Cursor does. Each such turn pays the service's startup (a few seconds). Chat mode denies every OpenCode tool, so it gets no orchestration server. OpenCode also asks its own permission for each tool call, so supervised chats see an OpenCode approval before the server's own for tools that need one.

## Engine parity: delivery, limits and capabilities

Children and lineage. An orchestration child is any task with `delegation` (`delegation.parentTaskId` is the owning chat): delegated children, and forks and handoffs made through agent tools. `Task.parentId` is lineage only. Delegated children point at the delegating chat; forks and handoffs, whether user-made or agent-made, point at their source. Ownership checks, `list_threads`, cancellation cascade and limits all use `delegation.parentTaskId`. The renderer hides only tasks with `delegation` (`isOrchestrationChild` in `shared/orchestration.ts`), so user branches and handoffs stay in the sidebar.

Delivery. When a child reaches completed, failed or interrupted, a SQLite trigger records one outbox row per run, keyed by child, last user message and status. A row is written only if the child is background, or if its parent abandoned a wait for it. Version 1 of the trigger used `INSERT OR IGNORE`. Inside a trigger fired by `saveTask`'s upsert, the outer statement's conflict policy applies, so re-saving a finished background child (rename, archive, inbox read, send) raised UNIQUE. The runtime's cleanup was then skipped, the child was marked failed, and the parent ran twice. The trigger is now dropped and recreated on every open, as `INSERT … SELECT … WHERE NOT EXISTS` (schema `user_version` 2).

Collection groups pending rows by parent into one queued message. Each result section starts "Delegated agent …"; `sourceTaskId` is the first child and `sourceTaskIds` lists every child. If the parent's last queued item is still an undelivered result batch, new results are appended to it. The runtime starts an idle or completed parent 250 ms after a delivery, so children finishing together cause one wake. Results arriving while the parent runs share one follow-up turn. A stopped parent is not sent "interrupted" results for children it stopped. At launch, both outbox rows and already-queued deliveries or merges wake idle parents in the same way. A child interrupted by app shutdown therefore wakes an idle parent on the next launch.

Waiting. `wait_thread` defaults to 10 minutes and accepts up to 60. Following T3's upgrade-to-always-wake, the child is marked for delivery in three cases: the wait times out, the caller disconnects (MCP request closed or the Phaseo tool signal aborted), or the parent's turn ends while a foreground child is still active. The child's next result then arrives as a message. Such a wake covers one result; later runs follow the child's own `background` setting. Codex gets `tool_timeout_sec = 3660` for the orchestration server, and the Pi bridge allows 61 minutes per call.

Questions. A child waiting on a question ends its parent's `wait_thread`, which returns `pendingQuestions` (request ids). `read_pending_questions` lists or reads them (header, question, options with the value to send, whether the agent's own text is allowed) for an owned child or a launched chat, and `answer_question` (approval: Answer agent question) answers through the same `answer` command and checks as the person's panel. Approvals, secret questions and questions answered by message are never listed or answerable: they stay with the person.

Limits. There is no depth limit and no per-parent limit. One workspace-wide limit caps active orchestration children: running or waiting, or idle with queued work. It is set by `WorkspacePreferences.maxActiveAgents` (default 32, whole numbers 1–256, "Agents running at once" in Settings → General). Preferences saved before the limit existed read as 32. `delegate_task`, `fork_thread` and `handoff_thread` check the limit inside their creating transaction, and `send_thread` checks it before starting a stopped child. The error names the setting.

Privilege ceiling. A child, fork or handoff never gets a broader mode (chat < plan < code) or `permissionMode` (supervised < full-access) than its parent. `delegate_task` accepts optional narrower `mode` and `permissionMode` and rejects broader ones. Forks and handoffs always take the parent's mode and permissions, whatever the source had. Children of a Chat parent run in Chat.

Accounts. When no `accountId` is given, `delegate_task`, `handoff_thread` and `list_models` use the parent's account on the same harness, then the single usable account (configured, not archived, OAuth not expired). For Phaseo and Cursor, which require an account, zero or several usable accounts give an error that names the choices.

Tools in every mode. The orchestration MCP server is created for every mode of every harness except Phaseo, which calls the tools in-process, and OpenCode in Chat (see above). In Chat the server is the only tool surface:
- Claude: `tools: []`, `strictMcpConfig` and a `canUseTool` that allows only `mcp__<orchestration>__*`. Those calls are approved by the server, so Code no longer double-prompts for them.
- Codex: a read-only sandbox, other servers disabled, and Codex's own orchestration-call elicitations are routed to the user.
- Cursor: `tools: ["mcp"]` with only the orchestration server. Plan mode adds `mcp` to its read-only allowlist.
- ACP and Grok: only the orchestration server, with file and terminal capabilities still off.
- Pi: `--tools mcp__phaseo__*` in Chat, and the Plan allowlist adds that pattern. Pi's `--tools` filters extension tools and `--no-tools` disables them.

Claude background work. Claude ends its background shells and monitors when its input closes, and Phaseo used to close the input as soon as the prompt was sent, so a turn could not outlive them. For Claude chats with the orchestration server, `background_wait({ taskIds, waiting? })` marks tasks the turn waits for (ids Claude reported with `task_started`; others come back unmatched). The adapter keeps the prompt stream open until a result arrives with no awaited task unfinished, so the chat stays Working. When the last awaited task finishes after a result, Claude is expected to wake and answer; if no result follows within a minute, the input closes and the turn ends. Not verified against a live Claude session: the fixture covers the stream order only. Other harnesses do not get the tool.

Drain now reloads the task after the asynchronous server setup, so prompts queued meanwhile are not overwritten.

Instructions. `orchestrationInstructions` (`shared/orchestration.ts`) covers when to delegate, choosing with `list_agents`, stable request ids, background versus wait, results as messages, and limits. It is added to:
- Phaseo: Chat and Code instructions.
- Claude: `systemPrompt`. The SDK default is otherwise empty.
- Codex: `developer_instructions`.
- Pi: the `before_agent_start` prompt.
- ACP and Cursor: a leading prompt block on new sessions only. ACP has no system prompt, and Cursor's `systemPrompt` would replace its harness prompt.

Capabilities. `list_agents` (T3's `orchestrator_capabilities`) returns `{ harnesses: [{ harness, accountRequired, accounts: [{ id?, name, total, models: [{ id, name, legacy?, default?, options? }], error? }] }], unavailable: [{ harness, reason }], limits: { activeAgents, maxActiveAgents }, truncated? }`. It uses the composer's `discoverDesktopModels` and installation check (cached 5 minutes) and the 10-minute model cache. Native discovery runs two at a time. Non-legacy models come first. Output is capped at 60,000 characters by trimming option lists, then options, then models per account. Optional `harness` and `query` narrow it. `delegate_task` accepts `modelOptions` and validates them against the chosen model's descriptors.

Approvals carry per-tool labels (`threadToolLabels`): Delegate task, Hand off chat, Fork chat, Send agent prompt, Steer agent, Rename agent chat, Edit agent queue, Merge agent result, Launch chat, Launch chats, Organise chat (Archive chat when archiving), Add project, Clone project, Schedule task, Update schedule, Delete schedule, Run schedule now.

## Top-level launches, projects, organisation and schedules

These follow T3 Code's `t3_thread_launch`, `create_threads`, `t3_project_list`, `t3_thread_organize` and scheduled-task tools. They are registered in `threadTools()`, so Phaseo calls them in-process and every other MCP-capable harness gets them from the per-turn orchestration server and the Pi bridge.

Delegate or launch. A delegated child belongs to its parent: it stops and is archived with the parent and reports back. A launched chat is an ordinary top-level chat. It has no `delegation` or `parentId`, so it appears in the sidebar and chat history like a user-created chat. It carries `Task.launch = { byTaskId, requestId }` (also on `TaskOverview`, persisted in the task JSON, with a SQLite index on both fields). The launcher may use `read_thread`, `wait_thread`, `send_thread`, `steer_thread`, `interrupt_thread`, `list_threads` and `organize_thread` on chats it launched. Results are never delivered back: `wait_thread` on a launched chat does not request a wake, so the launcher waits again or reads. Cancelling or archiving the launcher does not stop launched chats; only its orchestration children are cascaded, as in T3. Forks of a launched chat drop `launch`.

`launch_thread` takes `{ requestId, title, prompt, harness?, model?, accountId?, modelOptions?, mode?, permissionMode?, workspace? }` and returns `{ id, title, projectId?, worktree?: { branch, directory } }`. `launch_threads` takes `{ threads: [...] }`, 1 to 20 entries with distinct requestIds, and returns `{ results: [launch result | { requestId, error }] }`. Workspace strategies:
- `{ strategy: "same" }` (default): the caller's project, or none.
- `{ strategy: "none" }`: no project.
- `{ strategy: "project", projectId }`.
- `{ strategy: "worktree", projectId?, branch, baseRef? }`: `WorkspaceRuntime.createWorktree` on a new branch from `baseRef` (default `HEAD`) of `projectId` (default the caller's project), registered as a worktree project.
- `{ strategy: "existing_worktree", projectId }`: the project must be a desktop worktree.

Worktree children. `delegate_task` takes `isolation: "shared" | "worktree"` (default shared) and, with worktree, an optional `branch`. A worktree child gets a new worktree project from the parent project's `HEAD` (uncommitted edits stay behind) on `branch`, by default `phaseo/<title>-<6 hex of parent and requestId>`, so a retry names the same branch. Concurrent retries share one in-flight creation. The project's setup actions run as for any worktree. `delegate_task` and `wait_thread` return `worktree: { projectId, branch }`, and a delivered result says which branch the child worked on. A chat without a project cannot isolate. The worktree stays after the child finishes; the parent or the person merges or removes it.

Moving a chat. `move_to_worktree` (approval: Move chat to a worktree) takes `{ branch, baseRef?, runSetup?, continuationPrompt? }` and moves the calling chat into a new worktree of its project, from `baseRef` (default `HEAD`; uncommitted edits stay behind), running setup actions unless `runSetup` is false. It refuses a chat without a project or already in a worktree, and one move at a time. The chat's `projectId` changes at once, but the running turn finishes in the old folder: each turn's drain resolves its folder and MCP servers when it starts. Native sessions belong to their folder, so the move clears `nativeSessionId` and sets `handoffFrom` to the chat's own harness; the next turn starts a fresh session with the conversation as handoff context, and a session id the old turn reports after the move is ignored. `continuationPrompt` is queued and starts that turn (at once if the chat is idle); without it the chat waits for the person.

Queues. `read_thread_queue` reads the queue of the caller itself (what the person queued next), a delegated child or a launched chat. `edit_thread_queue` (`{ id, messageId, text?, action? }`) changes only children and launched chats: `text` edits, neither removes, `action: "up" | "down"` moves one place (`queue-move`) and `action: "steer"` sends the prompt into the running turn through the composer's steer path (`steer` with `queuedId`, so a refused prompt returns to the queue). It returns the new order. `send_thread` with `restart: true` cancels a running turn, waits for it to end, puts the prompt ahead of the queue and resumes, so the prompt starts the next turn.

Launch guards:
- The caller must be `permissionMode: "full-access"` and not in Plan mode (T3 requires full access and the default interaction mode).
- Mode and permissions default to the caller's and can only be narrower (`childPrivileges`).
- Model, account auto-pick and `modelOptions` validation share `agentSettings` with `delegate_task`.
- A launched chat counts toward `maxActiveAgents` while it is running or has queued work. `activeAgentCount` counts `delegation.parentTaskId` or `launch.byTaskId`.
- A repeated requestId from the same caller returns the existing chat. Concurrent identical calls share one in-flight launch, and the store re-checks inside its transaction. T3 has no retry key.
- `launch_threads` runs every check first: structure, privileges, workspaces, models, distinct worktree branches and capacity for all new entries. If any check fails, nothing is created. Creation then runs serially. A later failure, for example Git refusing a branch, is reported for that entry only.
- A worktree is created only after validation. If the chat then fails to register, the error names the new worktree project so a retry can use `existing_worktree`.

`list_projects` (`{ query? }`) returns `{ id, name, directory, current?, worktree?: { branch, baseCommit, sourceProjectId }, removed? }`. `directory` is the folder name only, never the full path. Listing needs no approval.

`add_project` (`{ path }`, an absolute folder) and `clone_project` (`{ url, parentPath? }`) add projects, with approval (Add project, Clone project) and the launch guards' full access outside Plan mode. A folder already added returns its project with `alreadyAdded`. `clone_project` uses the Clone repository flow's checks (`projectClone.ts`: HTTPS and SSH addresses only, no password prompts) and clones into a new folder named after the repository inside `parentPath`, by default the folder that holds the caller's project (the original checkout's, for a worktree chat). Both return `{ id, name, path }`. Agents cannot remove projects.

Attachments. `delegate_task`, `launch_thread` (and `launch_threads` entries) and `send_thread` take `attachments`: up to 10 file paths, absolute or relative to the caller's project. Each file goes through the composer's attachment checks (images, PDFs and UTF-8 text, 10 MB) and is copied into the attachment store before the chat is created, then recorded against the receiving chat and put on its first prompt (or on the sent prompt). A failed file names itself and nothing is sent. Chat-mode callers have no file access, so they cannot send attachments.

`organize_thread` takes `{ id, action: "pin" | "unpin" | "archive" | "unarchive" | "rename", title? }`. It applies to the caller itself, its orchestration children and chats it launched. A chat cannot archive itself. Archiving first cancels an active or queued chat, then uses the runtime's archive path, which stops that chat's agent tree. Its `requireApproval` is a predicate (`action === "archive"`). The Phaseo agent loop already supports predicates; the MCP server now evaluates them too.

Schedules are scheduled tasks (stored as missions). `MissionService` registers its command handler as `WorkspaceRuntime.missionCommand`, so the tools share the Scheduled tasks page's validation, timing and change notifications:
- `schedule_task` takes `{ title, prompt, schedule, templateTaskId?, postInThisChat?, enabled? }`. `schedule` is `{ type: "interval", minutes: 1–10080 }` or `{ type: "daily", time: "HH:MM", weekdays: [0–6] }` (local time; Sunday is 0; `[]` means daily). The template defaults to the caller. Unlike the Scheduled tasks page, it is enabled unless `enabled: false`, matching T3. With `postInThisChat` (template must be the caller), the mission stores `threadTaskId` and each run sends its prompt to that chat, with the chat's own settings, instead of starting a new chat. A run is skipped while that chat is busy, and only an admitted run marks the mission running, so the person's own turns in the chat do not. The Scheduled tasks page shows "Posts in" with the chat, and **Start a new chat each run** in the row's menu clears it (`threadTaskId: null` in `save`; omitted keeps it).
- `update_scheduled_task` takes `{ id, enabled?, title?, prompt?, schedule? }`.
- `delete_scheduled_task` and `run_scheduled_task_now` take `{ id }`.
- `list_scheduled_tasks` takes `{}`.

Scheduling guards:
- Create, update, delete and run need the full-access, non-Plan caller and approval. Listing needs neither.
- A template must be an active chat whose mode and permissions are no broader than the caller's. Existing missions are checked against their template the same way; deletion tolerates a deleted template.
- Scheduled runs copy the template's harness, model, settings, mode, project and permission mode, read when each run starts. A run from a full-access chat runs with full access; change the template chat's permissions to change later runs.

Validation: deterministic fixtures in `orchestrationParity.test.ts`, the store, thread-tool and adapter suites. Unverified against live providers: Claude `tools: []` keeping MCP tools, Codex `developer_instructions` and elicitation for orchestration calls, Cursor `tools: ["mcp"]`, Pi's `mcp__phaseo__*` pattern on older Pi releases, and client-side MCP call timeouts other than Codex and Pi.

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
