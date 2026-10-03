# Desktop AI workspace

## Change brief

Build on the existing Electron application for people doing coding, research,
writing, analysis, and other AI work. Own the Phaseo interface and harness;
integrate native engines without treating subscription credentials as API keys.
Preserve existing platform navigation and desktop security boundaries.

Reference baseline (2026-10-03): OpenCode v2.0.22
(`527f0b931d1f9b3ebd34e106c51b31ce5db5b075`) and T3 Code
v0.0.46-nightly.20261003.2610 (`8ed276c246b624631e7d39241ebfd22d8314cb68`).
Sources: https://opencode.ai/v2/docs and
https://github.com/pingdotgg/t3code/releases/tag/v0.0.46-nightly.20261003.2610.
Use the Phaseo website's fonts, assets, components and spacing conventions as the visual source of truth, adapted to the existing native desktop frame.

## Acceptance ledger

Every unchecked item remains a parity gap. A visible control or mock response
does not establish completion. Tests must cover runtime behavior and UI states.

- [ ] Durable projects, task history, search, archive, rename, pins, pagination
- [ ] Multiple accounts, native sign-in, secure API credentials, model discovery
- [ ] Native Codex, Claude, OpenCode 2, Pi, Cursor, Grok, Antigravity, ACP agents
- [ ] Phaseo harness, compatible providers, local models, streaming, tools
- [ ] Attachments, file references, thread references, general AI tasks
- [ ] Permissions, questions, plans, todos, tool and reasoning visualization
- [ ] Durable queue editing/reordering, steering, cancellation, crash recovery
- [ ] Forks, rollback, compaction, snapshots, cross-harness handoff
- [ ] Delegation, native subagents, lineage, background work, agent management MCP
- [ ] Git status/diffs, branches, worktrees, commits, PRs, review/merge checks
- [ ] Terminal, files/editor, previews, scripts, external editor integration
- [ ] Skills, commands, MCP, plugins, instructions, policies, per-project settings
- [ ] Schedules, usage meters, limits, reset-aware resume, notifications
- [ ] Shared background service, remote pairing/access, client authentication
- [ ] Import/export, updates, keyboard shortcuts, themes, accessibility
- [ ] Coding and non-coding end-to-end validation on desktop

## Implementation and evidence

Changes are confined to the desktop app and necessary integration packages.
Keep credentials and filesystem/process execution in the trusted runtime.
Validate IPC inputs, project boundaries, cancellation, and durable transitions.
Native-provider capabilities remain explicit; unsupported combinations must
explain what is needed rather than silently using a different billing route.

Current implementation (partial parity): SQLite task/project/account history,
search/pins/rename/archive/restore, durable editable queues, interruption recovery,
encrypted API credentials and isolated native account profiles, Codex app-server,
Claude Agent SDK, OpenCode 2 service integration, Pi RPC and ACP agents, native forks, explicit permissions,
compatible streamed chat, and the Phaseo Agent SDK with persisted checkpoints and
approved file writes. Project browsing enforces realpath boundaries; Git review
shows staged and unstaged changes, with literal-path staging, commits and local
branch creation/switching. The file editor checks content hashes before writes
and retains unfinished drafts across navigation. Real PTY terminals persist
transcripts. Codex, OpenCode V2, Pi and API model discovery and command search are connected.
Cross-harness handoff copies visible conversation into a fresh native session.
Image/text attachment snapshots persist independently of their source files;
PDF text extraction runs in a bounded worker and includes page provenance.
Task and attachment drafts persist across navigation, with local previews.
ACP agents can request approved command terminals with bounded UTF-8 output,
exit/kill/release lifecycle and process-tree cleanup. Agent-managed ACP sign-in
offers the agent's native authentication methods when authentication is required;
interactive terminal sign-in is described below.
OpenCode session forms support typed values, conditional/default fields,
explicit external acknowledgements, cancellation and native validation retries.
Provider-defined patterns are validated by OpenCode rather than evaluated in
Electron's main process. Resumed sessions rediscover pending forms.
Phaseo Code/Plan currently accepts text documents; images require Chat or a
vision-capable native harness. PDF OCR is not implemented.

OpenCode startup reuses compatible external services or starts a verified V2
executable with an app-owned registration file; shutdown stops managed services.
The desktop enforces one process per user-data directory to prevent duplicate
task execution and service ownership. Native configuration/accounts remain owned
by OpenCode; the Phaseo service does not install or upgrade a global CLI.

Codex live steering targets the active native turn and records a client message
identity before delivery. Rejected or unacknowledged instructions remain visible
for explicit queue/discard decisions; restart never replays an uncertain send.
OpenCode steering uses stable native inbox identities and waits for accepted
instructions to settle, including submissions overlapping a completion event.
Pi live steering uses its native steering queue and preserves rejection versus
uncertain delivery. Completion checks wait through concurrent steering admission,
native queue consumption and compaction. Cancellation clears native queued input
before aborting, because Pi can otherwise continue queued messages after abort.
Claude and other harnesses still use ordinary queued messages.

OpenCode resumed tasks rediscover pending forms before sending the next message,
deduplicate snapshot/event overlap and continue consuming requests while waiting
for native execution to settle.

Conversation export supports Markdown with document text/embedded images and
versioned JSON with original attachments. Native session/account references and
project paths are excluded. JSON import restores messages and original files into
a fresh task with the selected harness/account/project. It revalidates file bytes,
regenerates attachment/message IDs and commits task/file references together;
importing never starts execution or carries native runtime configuration.
Native account checks read Codex app-server account/limits and Claude's documented
`auth status` command. Quota windows preserve unavailable values and backend usage
permission; percentages never imply permission to resume. Selected Claude profiles
clear inherited OAuth/API tokens and provider billing flags across sign-in/status/run.
Source: https://code.claude.com/docs/en/cli-reference.
Account editing supports names, API endpoints and encrypted key rotation. Active
turns block connection changes; key rotation commits a new credential reference
before retiring the old key. Account archival hides profiles from new task choices
while preserving linked task history and supports restoration.
Existing conversations can change model and mode between turns. Settings retain
history and native session identity and never start execution by themselves;
active/shutting-down turns block edits. OpenCode resumes and forks reapply native
agent selection and explicit tool permissions before prompting. The isolated V2
binary verified native agent/permission changes without inference.
Codex task settings expose each model's native reasoning options and validate
selected efforts before starting a turn. Returning to Default resolves the native
model default, and changing models clears the previous model's effort selection.
An isolated installed-Codex catalog returned eight models with reasoning options
and a reported default, without signing in or running inference. Other harness
reasoning controls remain outstanding.
Managed MCP connections persist with global or project scope, editing, disable,
archive and restore controls. Codex, Claude, OpenCode and compatible ACP agents receive
enabled connections in Code/Plan mode. Native MCP names isolate these settings
from existing provider configuration. Codex/Claude/OpenCode wait for managed readiness
before submitting prompts; failures and cancellation do not submit input. OpenCode
setup is serialized per native workspace and reapplies durable settings after a
service restart. Owned local MCP processes connected through installed Codex, Claude
and isolated OpenCode V2 with zero prompts or inference calls. Confirmed preflight
rejections retain the original queued input for explicit retry; uncertain transport
failures do not automatically replay input. ACP setup passes
connections through new/load/fork and checks HTTP support before opening sessions.
Phaseo/Pi managed MCP, custom encrypted MCP credentials, OAuth management,
catalog browsing and native plugin/skill controls remain outstanding.

Codex and Claude MCP elicitations use the existing typed form UI for primitive
fields, standard titled/single/multiple choices and HTTPS external verification.
Unsupported schemas decline explicitly, cancellation reaches the native response,
and Codex rejects requests belonging to another thread. Owned local server checks
confirmed accepted form responses through both installed native engines with zero
prompts or inference calls. Provider-specific verification modes remain outstanding.

ACP agent profiles support editing, archival and restoration. Connection checks
initialize the configured native process without creating sessions or advertising
host filesystem/terminal access, and report native versions, capabilities and
sign-in methods. Active turns prevent executable/argument changes. An isolated
Electron fixture verifies connection checks and profile management without inference.
ACP sessions retain agent-reported grouped model catalogs across restarts and show
them in task settings. Model selection uses the native configuration ID and checks
the current catalog before prompting. Pre-prompt ACP setup failures retain the
original input for explicit retry. An owned agent fixture verifies native model
discovery and selection through the real Electron runtime without inference.
ACP mode catalogs also persist and expose an independent agent-mode selector.
Native mode/configuration methods apply the chosen value before prompting, skip
unchanged selections and reject unavailable modes. Desktop Chat/Plan/Code controls
still govern advertised host capabilities and permission responses.
ACP terminal sign-in runs the configured native command in an embedded interactive
PTY after the user chooses a native method. A successful exit retries session
creation; terminal methods are never sent to ACP authenticate. Sign-in output stays
in memory and is excluded from saved transcripts. Cancellation kills the sign-in
process and preserves the original task input. A crash during sign-in recovers the
same original input for explicit retry. Owned Electron fixtures verify interactive
completion and cancellation without real provider sign-in or inference.

Git review creates a new managed worktree from a chosen commit/ref and new branch,
registers it as a linked project and makes it available to tasks, files and
terminals. Source working changes remain in the source checkout. Git mutation
queues share the repository's common Git directory across worktrees; review reads
disable optional index locking. Real Git fixtures verify commit/branch isolation
and durable project relationships, and Electron verifies the creation controls.
Managed removal checks tracked/untracked changes before and after stopping managed MCP tools, refuses active tasks, terminals and editor/Git mutations, and preserves branches and conversations. Removed projects cannot start execution; handoff can continue their history elsewhere. Real Git tests and Electron confirmation controls verify removal. Checkout restoration and pull-request workflows remain outstanding.

Inbox lists live approval/form requests, uncertain steering, failures, interruptions, limits and completed tasks. Attention, unread and all-activity filters link to the existing task workflow. SQLite retains exact-version read acknowledgements without changing task order or execution; reviewing an older version cannot mark a newer update read. Pending requests remain in attention after review. Electron verifies unread completion review and navigation without inference.

Settings persist notification mode and optional task-title previews in SQLite. Native Electron notifications observe semantic task/request changes, suppress foreground alerts, deduplicate repeated snapshots, group bursts and route clicks to tasks or Inbox. Startup seeds existing history without alerts; operating-system failures cannot interrupt execution. Notifications default off, and titles remain hidden unless enabled. Unit tests verify transition/OS behavior through a notification port; Electron verifies settings and the trusted click-navigation event. Actual operating-system alert display remains unverified.

Missions persist interval or local-time/weekday schedules and use a selected task as the current account/harness/model/project configuration. New missions start paused. Each admitted run creates a fresh linked task and records its admission atomically with the mission; existing conversations/native sessions are not copied. The app-owned scheduler skips missed runs, prevents overlapping runs (including manually resumed older runs), leaves approvals interactive, and pauses on failure/interruption/limits. Crash recovery retains an admitted original instruction for explicit review without replay. The renderer supports create/edit/enable/pause/run/delete and run history; deleting a definition retains its task history. Real Electron exercises an owned ACP fixture without paid inference. Schedules run while the app process is open; remote/background-service schedules and explicit timezone selection remain gaps. Sources: pinned T3 contracts and scheduledTasks/Schedule.ts.

Notification click navigation is buffered in preload until the renderer subscribes, so clicks during window startup are retained.

Cursor uses the pinned T3 baseline's official SDK 1.0.31. Browser sign-in mints a user key through the SDK with plaintext persistence disabled; managed keys use the existing encrypted device vault, and accounts have isolated JSONL session stores. The renderer supports API-key setup/rotation, status, model discovery, task settings, native streaming/activity/cancellation and acknowledged live steering. Chat disables native tools and ambient settings; Plan uses an explicit read-only tool list; Code requires a whole-turn approval because the SDK has no per-tool approval callbacks. Native policies and Auto-review apply after approval. Managed MCP connections apply to Code turns. Forks create a fresh session with visible history rather than claiming native SDK fork support. Real SDK create/resume checks use a local model-catalogue response fixture and submit no prompt, including inside the Windows packaged archive. Cursor's SDK is proprietary; its unmodified licence notices are preserved. Real Cursor browser login, paid inference, and sandbox execution remain unverified.

Desktop typography uses the web app's existing Montserrat font assets, bundled offline with their OFL notice, and its actual logo. Light/dark semantic palette values match web globals; button/input sizing and focus rings follow the web primitives. A rendered audit against the live website identified unpadded Missions forms, unstyled Agents/MCP controls, tiny labels, stretched Home panels, inaccessible sidebar footer controls at minimum height, and a collapsed conversation title at minimum width. The layout pass fixes those issues with consistent page/form spacing, restrained panel borders, readable labels, independent sidebar scrolling and wrapping conversation actions. Settings now uses aligned rows. Menu placement follows its trigger instead of hardcoded offsets. The theme action reflects the displayed theme even while following the operating system. Electron verifies all three bundled font weights and theme controls. `audit:design` captures nine screens plus a conversation at 1440×920 and 1040×680 in both themes; see `docs/design-audit.md`. This is a visual checkpoint, not complete accessibility or product-design parity.

The Platform overview is a tenth captured screen. Its decorative marketing hero and unverified health/readiness badges are replaced by concise links to existing web tools; live platform data integration remains outstanding.

ACP mode configuration now prefers the modern configuration selector when an agent also supplies legacy modes. Mode changes refresh the complete configuration before model validation; unavailable model choices are rejected before submitting the instruction. A mode response must confirm the chosen mode. Real SDK packet tests cover dual-mode advertisements and dependent model catalogs.

An isolated official Grok 1.0.46 Windows binary startup check used verified npm archive integrity, a fresh `GROK_HOME`, disabled auto-updates and forced a process-owned agent instead of a shared leader. Initialization and signed-out session rejection passed with zero login/inference calls. This release advertises `grok.com` authentication and initial models under initialization metadata, differing from the pinned T3 implementation. Native Grok execution, authentication and extension callbacks remain unfinished; the selector stays unavailable until integrated.

Evidence: desktop lint/typecheck/build pass; 231 deterministic tests cover protocol,
queue ordering, cancellation, secret storage, filesystem boundaries, stream framing,
and SDK approval continuation. An isolated Electron smoke test verified task CRUD,
IPC validation, renderer navigation, real PTY execution, editor saving and stale-edit
rejection, Git staging/commits, command search, attachment imports and PDF previews.
Protocol-shaped renderer fixtures check form defaults, conditional visibility,
numeric bounds and choices; native form replies have separate runtime coverage.
The same checks pass against the Windows packaged archive. Pi fixtures
verify that agent_end does not finish a task and compaction must settle first.
An isolated OpenCode v2.0.22 binary check verified concurrent service startup,
session creation, typed form validation/replies/cancellation and process shutdown,
with zero inference calls. Its model catalog was empty because the test profile
had no connected providers. Installed Codex and Claude status commands returned
signed-out state for fresh isolated profiles with zero inference calls. Account
quota rendering uses protocol-shaped fixtures; real signed-in quota reads remain
unverified. Live paid inference and real provider login
have not been exercised. Broad ledger items stay unchecked until all their parts
have runtime and UI coverage. The desktop smoke command is `pnpm --filter
@phaseo/desktop test:desktop`; it uses a fresh temporary user-data directory.

Validation: desktop lint, typecheck, deterministic unit/integration tests, builds,
and rendered desktop workflows. Live paid inference requires the user's
authorized credentials and must be reported separately from fixture evidence.
