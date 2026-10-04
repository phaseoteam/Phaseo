# Desktop AI workspace

## Change brief

Build on the existing Electron application for people doing coding, research,
writing, analysis, and other AI work. Own the Phaseo interface and harness;
integrate native engines without treating subscription credentials as API keys.
Preserve existing platform navigation and desktop security boundaries.

Reference baseline (2026-10-04): OpenCode v2.0.22
(`527f0b931d1f9b3ebd34e106c51b31ce5db5b075`) and T3 Code
v0.0.46-nightly.20261004.2644 (`737993303d36e10674c54b95e5bd3826682c99c7`).
Sources: https://opencode.ai/v2/docs and
https://github.com/pingdotgg/t3code/releases/tag/v0.0.46-nightly.20261004.2644.
Use the Phaseo website's fonts, assets, components and spacing conventions as the visual source of truth, adapted to the existing native desktop frame.

Dropdown triggers now match the web select treatment with consistent chevrons, reserved text spacing and theme-aware native menus. The single-workspace identity no longer exposes an inactive switching button. Source and packaged visual checks cover the trigger styles; native menus and forced-colour rendering remain platform verification work.

Cursor SDK 1.0.31 foreground updateTodos completions now project confirmed result snapshots into structured progress. The adapter validates agent/run ownership, requires successful untruncated results and preserves cancelled steps and empty-list clears. Failed/malformed updates remain raw tool activity. Native SDK fixtures and shared rendered cancellation checks cover this path; live subscription execution remains unverified. The installed OpenCode V2 client exposes no todo event and the pinned T3 OpenCode2 adapter declares no plan/todo emission, so no unsupported event mapping was invented.

Conversation history now has a trusted preload/IPC page API that selects at most 100 message or activity rows from SQLite, in order, around stable entry IDs. Responses include revision and older/newer counts without unrelated task bodies. A 1,000-message fixture verifies bounds, forward/backward navigation and stable cursors after appends; source and packaged Electron workflows exercise the real bridge and limit rejection. Selected-task reads now project only 50 recent messages and 50 recent activities from SQLite; runtime/export retain complete history. The renderer pages in both directions while keeping at most 100 messages and 100 activities. Source and packaged workflows traverse all 1,000 messages without exceeding the bound, preserve the reading anchor, retry failed pages, refresh edits arriving during a delayed page and prevent duplicate page requests. Per-entry byte limits, full metadata pagination and performance profiling remain separate work.

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

Native OpenAI turn plans, successful foreground Claude TodoWrite results and ACP plan notifications now retain structured step statuses alongside their original payloads. OpenAI plans reject foreign threads/turns; Claude failures and delegated tool calls cannot overwrite foreground progress. Known statuses normalize into pending/in-progress/completed; malformed or excessive payloads retain the raw activity presentation. Runtime updates persist steps/explanations and a separate SQLite reader verifies the latest snapshot. The renderer shows counts, explanations and an initially expanded checklist with inert text, bounded scrolling and exact original-result copying. Protocol/SDK fixtures and rendered 30-step fixtures verify these paths; live provider execution, other task/todo tools and provider-specific plan variants remain unverified, so the ledger stays unchecked.


Conversation Markdown file links now open the task's registered project files in the selected available editor. Relative, absolute and local file URLs support line/column positions; web links retain their external action and unsupported schemes remain inert. The main process resolves absolute targets back through real project boundaries and validates positive bounded integer positions. Launch arguments use each editor's native position syntax. Parser/runtime tests and rendered request fixtures cover target positions, pending/retry feedback and duplicate suppression. Actual installed editor navigation, remote file links and broader file-reference discovery remain unverified.

Project/file editor integration now discovers 20 named editor families from absolute PATH entries and common native installation locations, remembers the selected available editor, and opens project folders or files from the preview/Git review. File-manager actions reveal a selected file or open a registered project folder. The main process revalidates sender, project availability, request schema and real paths before crossing the OS boundary. Editor processes use literal argument arrays with no shell and clear inherited Electron/Node execution flags. Six deterministic tests cover discovery, unsafe paths/links, missing installations, failure propagation and a real owned process; the Electron bridge workflow verifies registered paths and rejected requests using owned OS ports. The visual audit checks selected-editor persistence, one request for repeated clicks, failure/retry and preview/project/Git target selection. Source and packaged checks do not open installed editors or assert their UI behavior. Per-editor live launches, broader installation discovery, remote targets, setup scripts and other file/editor capabilities remain parity work. The ledger stays unchecked. Patterns were compared with the pinned T3 Code editor contracts/preferences/launcher and https://code.visualstudio.com/docs/configure/command-line.


Task-history pagination has a bounded SQLite query and trusted IPC/preload API. Pages return only task summaries, ordered by pins, updated time and a deterministic ID tie-breaker. Search checks titles and message text with Unicode case folding and literal punctuation. The renderer loads 50-row pages with loading, retry, empty and Load more states; changing search/archive resets paging and ignores obsolete requests. The isolated 155-task Electron workflow verifies later-page selection, Unicode message search, rapid searches, page reset, archive switching and exhausted/empty results. All renderer screens now consume metadata-only workspace snapshots. The full-history broadcast has been removed; command, account, MCP, import and worktree replies also omit conversation bodies. Runtime change observers and mission polling now read metadata rather than full history. Command and execution setup paths also use metadata or read accounts/projects/agents/MCP directly from their own tables. The overview still scans task metadata for each change. Selected-task IPC transfers complete histories, and explicitly expanded or continuously growing conversations can still increase DOM size, so the history ledger item stays unchecked.

The history workflow passes against the Windows archive, including an owned failed-read fixture that preserves visible rows and succeeds after Retry. CI now runs source and packaged history checks. Active streaming timestamps do not continuously restart history loading; status transitions still refresh the list. Broader Electron fixtures wait for paged rows before opening native model/authentication tasks. Markdown component renderers retain stable identities so history refreshes do not remount code blocks.

Selected conversations now read task controls and the 50 most recent messages/activities through a validated task-by-ID IPC API. Older bodies use the separate bounded conversation page API. Refreshes coalesce into one in-flight read for the current selection, obsolete selection replies are ignored, and failed reads offer Retry. Task saves advance a durable revision counter from the stored record, including unchanged timestamps and stale input snapshots. The renderer uses that revision for detail refreshes. The history workflow verifies delayed replies, rapid detail changes without overlapping reads and retry recovery. Workspace metadata revisions now drive these reads without receiving full task bodies in global events.

A typed workspace overview now projects task metadata and attention counts directly in SQLite, excluding messages, drafts, request bodies, activities, native session IDs and model catalogs. Home, Inbox and command search read this overview and its dedicated change event. Home includes failures and other unresolved attention states rather than labeling every waiting task as an approval. Tests verify payload omission, attention priority and archive behavior; Electron checks the overview read/event and Home/Inbox navigation into full detail. Accounts, Agents, MCP, Projects, Missions, Terminals and Tasks also use the overview. The old full-history change subscription and broadcast have been removed. The 155-task source and packaged workflow instruments reads and broadcasts to verify zero full-workspace reads during navigation and metadata-only change delivery. Runtime broadcasts now project metadata directly in SQLite. Notification identity uses the last user-message ID and request IDs/statuses, preserving replacement-request alerts without body reads or alerts on streamed tokens and title edits. Mission polling reuses one overview per tick and reads a single ended task only when its error is needed. Startup recovery selects only interrupted/authentication/uncertain-steering candidates rather than deserializing all completed history. Tests instrument task creation, execution setup, streaming and idle polling to reject full-store reads. Runtime commands, imports and worktree results now return metadata directly, removing redundant IPC projections. Account/model discovery, native sign-in, project/file/Git access and terminal setup use direct reads of the relevant configuration tables. Full history remains available only through the trusted diagnostic bridge and test assertions. Conversation history/native state tests now use task-by-ID reads, including a reopened database check for uncertain steering after shutdown.

Conversation history initially renders 50 recent messages and activities. Older/newer pages use stable IDs and retain at most 100 entries of each kind. The selected-task IPC projection excludes older bodies. Visible-entry anchors preserve reading position when loading, removing or prepending content. Reopening resets recent history; live replies and delayed layout changes follow while the reader stays near the bottom. Source and Windows archive fixtures traverse all 1,000 messages in both directions, test 120 activities, failure/retry, duplicate suppression, a newer edit during delayed paging, and Jump to latest. Full runtime/export data remains durable. Per-entry byte limits, metadata pagination, profiling and complete accessibility remain unfinished.

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

Desktop typography uses the web app's existing Montserrat font assets, bundled offline with their OFL notice, and its actual logo. Light/dark semantic palette values match web globals; button/input sizing and focus rings follow the web primitives. A rendered audit against the live website identified unpadded Missions forms, unstyled Agents/MCP controls, tiny labels, stretched Home panels, inaccessible sidebar footer controls at minimum height, and a collapsed conversation title at minimum width. The layout pass fixes those issues with consistent page/form spacing, restrained panel borders, readable labels, independent sidebar scrolling and wrapping conversation actions. Settings now uses aligned rows. Conversation settings use a 24-pixel inset matching the toolbar/composer, including native reasoning/mode controls. Menu placement follows its trigger instead of hardcoded offsets. The theme action reflects the displayed theme even while following the operating system. Electron verifies all three bundled font weights and theme controls. `audit:design` captures ten screens plus conversation and native settings states at 1440×920 and 1040×680 in both themes (48 screenshots); see `docs/design-audit.md`. This is a visual checkpoint, not complete accessibility or product-design parity.

The Platform overview is a tenth captured screen. Its decorative marketing hero and unverified health/readiness badges are replaced by concise links to existing web tools; live platform data integration remains outstanding.

ACP mode configuration now prefers the modern configuration selector when an agent also supplies legacy modes. Mode changes refresh the complete configuration before model validation; unavailable model choices are rejected before submitting the instruction. A mode response must confirm the chosen mode. Real SDK packet tests cover dual-mode advertisements and dependent model catalogs.

An isolated official Grok 1.0.46 Windows binary startup check used verified npm archive integrity, a fresh `GROK_HOME`, disabled auto-updates and forced a process-owned agent instead of a shared leader. Initialization and signed-out session rejection passed with zero login/inference calls. This release advertises `grok.com` authentication and initial models under initialization metadata, differing from the pinned T3 implementation. Dedicated Grok execution and account setup remain unfinished; the selector stays unavailable until integrated. ACP extension support is described below.

ACP now handles Grok's five native completion notification aliases alongside the standard prompt response. Each submitted prompt carries a unique identifier; completion requires both that identifier and the root session. Child-session, missing-id, previous-turn and background-wake notifications cannot finish the foreground task. Background wake text is excluded from its transcript. Error/rate-limit/unknown completion signals fail the turn, and late RPC failures are consumed after notification completion. Cancellation releases the pending completion without surfacing a connection-flush race. Real SDK packet tests cover all aliases, failure outcomes and cancellation. Dedicated Grok account/harness setup remains outstanding.

Grok's native question and plan-exit requests now use the existing desktop question/approval controls through ACP. Both aliases and direct/wrapped payloads are supported. Answers retain selected labels, custom notes and single-choice previews. Payloads are bounded; duplicate identities/choices and invalid single-choice answers are rejected. Prototype-like identifiers remain ordinary data throughout parsing and rendering. Plan/Chat capture the proposal and defer implementation to a later Code instruction; Code requires explicit approval, and missing plans cannot authorize implementation. Packet tests cover session isolation and approval outcomes. An owned Electron fixture exercises preview rendering, answer submission, native reply annotations and Plan-mode proposal capture without network or inference. Dedicated Grok account/harness setup and plan-change feedback remain outstanding.

Grok's native model catalog now feeds ACP task settings, including advertised reasoning levels. Session-specific metadata takes precedence over initialization metadata. The transport preserves legacy session model fields before the stable SDK discards them; modern model configuration still takes precedence. Model and effort validation occur before the original instruction is submitted. `default` retains native defaults, private metadata is removed, and catalogs are bounded. ACP reasoning settings require an advertised choice and reset when the model changes. Real packet tests cover initialization/session/legacy resume catalogs and rejected choices. The actual isolated Grok 1.0.46 CLI catalog passed the same parser without login/inference. The owned desktop workflow selects model/effort in task settings, persists them and verifies their native application before a resumed prompt. Dedicated Grok account/harness setup remains unfinished.

The dedicated Grok backend now resolves the installed native binary directly, disables automatic updates and starts an owned ACP process with supervised Code or native Plan permissions. Selected profiles clear ambient Grok/xAI credentials and routing variables. Cancellation during discovery cannot launch a late process; discovery failures preserve the unsubmitted instruction. Native initialization declares an interactive client and cancellation identifies an explicit user stop. Nine launch/profile tests pass. Real isolated Grok 1.0.46 initialization passes with both permission settings without login or inference. Account creation, sign-in/status, renderer selection and Chat tool isolation remain unfinished; the dedicated harness is not yet exposed in the UI.

Native harness installation discovery includes Grok and uses the same direct-binary resolver as execution. Four discovery tests verify canonical installation preference, custom installation homes, native PATH fallback and missing installations. An ACP packet test verifies the selected profile environment and interactive client metadata reach the native transport.

The desktop account-status bridge now supports Grok's native `models` command without starting a session or sending a prompt. Explicit signed-in/out lines determine authentication; absent or contradictory evidence stays unknown. Output is bounded, terminal escapes are removed, selected profile environment is isolated and cancelled checks kill their process. Seven targeted tests pass. Real isolated signed-out CLI output confirms authentication can be false despite exit code zero. Sign-in and managed-account creation remain unfinished.

Grok's native sign-in backend uses the documented `login --oauth` browser flow in an isolated profile and requires an authenticated native status result before marking that profile configured. Cancellation settles without waiting for process exit, discovery cancellation cannot start a late process, and stalled attempts expire after ten minutes. Authentication output is drained without persistence. Six owned-process tests pass; actual browser OAuth remains unverified. Managed account creation and renderer selection remain unfinished.

Grok native profiles can now be created through Accounts, using the shared form layout and existing sign-in/cancel, status, edit and archive actions. API account creation remains unsupported for this harness and is rejected by IPC validation. The owned Electron smoke verifies profile creation, an isolated account directory, rendered actions/provider selection and archive without initiating login or inference. The dedicated task harness selector and actual browser OAuth remain outstanding.

The task and handoff harness selector now offers Grok Code/Plan with existing local login or a configured managed profile. Selecting Grok from Chat switches to Plan, and task settings omit Chat. Store validation rejects unsupported Chat creation/updates. Unit tests verify supported task creation and rejected updates; Electron verifies selector/mode behavior without inference. Grok model discovery before task creation, reasoning controls, Chat isolation and actual signed-in execution still need completion.

Grok task settings now display advertised reasoning choices and save them through validated task updates. Unavailable efforts are rejected without overwriting the saved choice; changing model clears the old effort. The isolated visual audit includes Grok settings in both themes/window sizes and verifies the offered reasoning choices and absence of Chat. Signed-in native execution remains unverified.

Managed MCP connection edits now include Grok in the active-task guard. An orchestration test verifies that changes are rejected without persistence while Grok executes, then become available after cancellation releases execution ownership.

Pre-task Grok model discovery now initializes the owned ACP process with file/terminal capabilities disabled, reads its advertised catalog and closes without authentication, session creation or prompts. The desktop model bridge and new-task model suggestions use this path with profile isolation. Packet tests verify public catalog parsing, unsupported-agent rejection and absence of session/prompt requests. Actual signed-in execution remains unverified.

The production Electron model bridge has now been checked against the isolated official Grok 1.0.46 binary: it returns Grok 4.6/4.5 and advertised reasoning choices without login, session or prompt requests. Additional packet tests verify stalled-discovery deadlines and launch-error cleanup.

Native account sign-in now rejects attempts while that account owns an active execution, including Grok and other native profiles. The check uses runtime execution ownership and releases after cancellation. An orchestration test verifies the affected account is blocked while an unrelated account remains available. Preventing new task starts during an already-active sign-in still needs implementation.

Account sign-in now owns a runtime lock until its completion/failure/cancellation cleanup. New instructions for that account remain queued and fail before adapter submission; releasing the lock does not replay them, and explicit Resume submits them once. Duplicate sign-in ownership is rejected and release is idempotent. The orchestration test verifies retained input, no provider call during sign-in and explicit recovery afterward.

Account updates, including archive/name/connection changes, now reject during sign-in ownership. The recovery test verifies rejected updates leave the profile unchanged. Credential/endpoint changes also consult execution ownership so provider setup is covered before the adapter enters the running map.

The current Windows package passes the owned archive workflow smoke, including Grok profile controls, task-mode selection and existing account-management/settings workflows. The packaged production model bridge also returns the real isolated Grok 1.0.46 catalog and reasoning choices without login or prompts. Actual browser OAuth and paid signed-in execution remain unverified.

Rendered Markdown code blocks now offer Copy with success/failure feedback. The renderer reads only the displayed code text, preserves formatting, and avoids confirming stale text after streaming changes. The isolated Electron audit verifies exact indentation/Unicode/newline preservation and failure feedback through an owned clipboard fixture in both themes/window sizes; actual operating-system clipboard writing is not covered by that fixture.

Grok Code-mode plan review now offers implementation, cancellation or written revision feedback through the existing question form. Packet tests verify approved, abandoned and request_changes responses, including validation against malformed selections. Plan-mode capture remains separate. Actual signed-in plan revision remains unverified.

The new-task Create and Import controls now share an 8-pixel spaced, wrapping action row. The isolated rendered design audit checks the row in both themes and window sizes.

Agent and MCP submit/cancel actions now share a full-width action row beneath the fields. Long agent commands remain fully inspectable through a native disclosure with wrapped code; connection results have a padded section. The 68-capture isolated audit checks agent command expansion and editor controls in both themes/window sizes, plus MCP action-row placement. This is layout evidence, not a complete accessibility audit.

Conversation code now uses Shiki 4.4.3, matching the website's GitHub light/dark colours. Selected common grammars load locally on demand; unsupported or oversized blocks keep plain text. React token rendering preserves inert markup, indentation, Unicode and trailing newlines. Unit tests verify exact source preservation and bounded fallback; the rendered audit verifies visible colours and clipboard feedback in both themes/window sizes. Copy feedback now survives unrelated renders and resets only when the code text/language changes.

Evidence: desktop lint/typecheck/build pass; 354 deterministic tests cover protocol,
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

Conversation queue layout now has a bounded scrolling region with an entry count. Editors occupy their own row and controls wrap; the composer retains its height. Rendered fixtures exercise 12 long queued instructions at both window sizes and themes, verifying the final entry stays reachable and conversation/composer space remains visible. This improves queue usability without claiming complete queue or accessibility parity.

Activity disclosures now use readable labels, padded bounded text and exact-source copying with success/failure feedback. Code and activity copy actions share stale-content protection. The owned clipboard fixture verifies output preservation, failure handling and changing content during a pending write, without changing the user clipboard. Rich native tool-specific views, reasoning timelines and complete accessibility remain unfinished.

Approval and question renderer controls now prevent duplicate submissions, show pending states and retain selections after failed delivery. Approval descriptions scroll within padded boundaries, and all request forms use wrapping action rows. Isolated rendered IPC-failure fixtures verify locking and retry behavior at both window sizes/themes. This is renderer evidence; complete native permission-policy parity and live provider delivery remain unfinished.

File previews and staged/unstaged Git diffs now reuse the conversation code surface with offline highlighting and exact-source copying. Changed-file rows align staging controls and wrap long paths; empty staged/unstaged states are distinct. The visual audit uses an owned real Git repository at both window sizes/themes. Existing source/packaged workflow tests cover file editing, conflicts, staging and commits. Ordinary tracked text changes now support individual staging and unstaging, with stale-diff rejection and exact working-file preservation. File-specific review uses shared 16-pixel insets, website typography and code surfaces; All changes returns to the aggregate view. Source and packaged real-repository workflows verify both directions, duplicate-click protection, literal Unicode filenames and four theme/window captures. New/deleted files, binary content and mode changes retain whole-file actions. Tracked text patches now render in split or unified form through the maintained Pierre diff library. Line staging and pull-request review remain unfinished.

Attachment text previews reuse offline code rendering and exact-source copying within a bounded modal. Reads support retry and stale-response isolation. Escape restores focus explicitly to the attachment trigger. An owned stored-document fixture verifies loading/failure/retry, exact copying, scroll/window containment and native keyboard focus at both window sizes/themes. The packaged smoke retains PDF extraction/preview coverage; Office documents, audio, OCR and full accessibility remain outstanding.

Command search now has loading/retry feedback, contained long titles and explicit keyboard focus restoration. Newer overview events supersede a delayed initial response, and active-option scrolling uses the visible bounded index. Owned metadata fixtures verify failure recovery, empty results, stale-response handling and native Escape/focus behavior in both themes/window sizes. Full metadata pagination and comprehensive accessibility remain unfinished.

Terminal session rows now share task-list styling and selection semantics. Sessions scroll independently of project/new-terminal controls, shared control sizing replaces local overrides, and close/delete controls disable during mutation. A 30-session rendered transcript fixture verifies scrolling, control visibility and usable output space in both themes/window sizes. Real PTY execution retains separate packaged workflow coverage; full terminal management/accessibility parity remains unfinished.

Account usage now uses aligned full-width meters and separate windows/buckets, with explicit blocked/unavailable states and reset times. Unit coverage verifies over-limit display and duration labels; rendered fixtures verify meter values and widths at both window sizes/themes. All 319 desktop tests pass. Actual signed-in quota reads and reset-aware recovery remain unfinished.

Task history now scrolls independently of creation/search/archive controls. Long titles use two lines with a full-title tooltip, and selection exposes pressed state. The owned large-history workflow verifies retained controls and title clamping alongside paging, retries and selected conversation behavior. Full metadata/payload pagination and comprehensive accessibility remain unfinished.

Git review now prioritizes changes and commits above a collapsed worktree form. The native disclosure preserves access to branch/ref inputs, with 16-pixel expanded spacing and no duplicate branch label. Source and packaged real-worktree workflow checks and four theme/window captures cover this hierarchy.

Split/unified Git review now uses @pierre/diffs 1.5.1, the same library family used by the pinned T3 Code reference, adapted to website typography, GitHub light/dark syntax colours and wrapping code. The preference survives navigation, and the library loads only when reviewing a diff. Original line positions, Unicode paths, added/deleted text and missing-newline metadata have deterministic coverage. Unsupported metadata/binary or oversized patches retain their original raw surface and exact copying. Source and packaged real-repository workflows verify paired wrapped-line alignment, literal markup, copying failure/retry, persisted layout and unchanged working files while staging/unstaging. Eight captures cover both layouts/themes/window sizes. Aggregate reviews now expand unchanged context from validated HEAD/index/worktree snapshots, with stale-review recovery, duplicate suppression and Enter/Space controls. Text is bounded to 1 MB and 10,000 lines; isolated hunk panels keep their partial patch. Source and packaged workflows add eight context captures. Large-review virtualization, line actions, PR workflows and complete accessibility remain open. Licence notices retain the Apache 2.0 licence and transitive dependencies. The editor process fixture now yields during owned-directory cleanup so Windows can release process handles.

The October 4 nightly replaces the October 3 reference (8ed276c246b624631e7d39241ebfd22d8314cb68). Its 401-file delta has only been partially audited. Newly identified gaps remain unchecked:

- [ ] PR check/comment/conflict watchers that wake the agent with deduplicated updates.
- [ ] Model aliases and input/cache/output cost breakdowns, including speed premiums.
- [ ] Failed workspace preparation retry and the new resume/compaction behavior.

Desktop panels now follow the current web Card radius formula, with description-only heading gaps and themed shell focus outlines. Packaged rendered checks verify card shape and header focus across themes/window sizes; full accessibility remains unchecked. Grok setup copy names its own native account.

Conversation settings keep Save/Cancel visible outside bounded scrolling fields. Composer resizing and task setup are bounded to the current window. The packaged layout fixture checks simultaneous settings and maximum composer height while retaining readable transcript space. Full accessibility and scaling validation remain open.

Task creation, handoff and import now share a synchronous pending guard. Configuration stays locked during delivery; failures preserve selections and permit retry. Source creation and packaged creation/handoff workflows verify duplicate suppression and durable results without inference. Full native subscription execution remains unverified.

Initial OpenAI reasoning selection now uses the native model catalogue in task setup, resets when model/account/project changes, and is persisted on create/import/handoff. Default omits an explicit override. Malformed IPC and other-harness overrides reject; the native adapter validates against its current catalogue before starting a turn. Reopened SQLite and first-turn fixtures pass; source and packaged UI checks verify advertised options, resets, retry preservation and distinct destination effort. Initial reasoning/native-mode selection for other harnesses and live signed-in execution remain open.

Initial Grok reasoning now queries its trusted native catalogue before creating/importing/handing off a task, validates the model/effort and saves the catalogue for pre-turn settings changes. Default tasks retain their existing path. Discovery failure and unavailable account/model/effort leave no new task; shutdown waits for discovery and rejects late creation. Runtime/first-turn fixtures and native protocol tests cover this path. Rendered Grok setup uses an owned catalogue fixture and verifies advertised options, Plan selection, Chat exclusion and harness-change resets in both themes/window sizes. Signed-in execution and initial ACP native-mode discovery remain open.

Model discovery now has local loading/error/Retry feedback in setup and conversation settings. Retry preserves form values; account/project/harness changes reset dependent selections. Owned source and packaged IPC fixtures cover failure, duplicate click recovery and clean error messages; the packaged fixture verifies a typed model survives retry. Live catalogue outages remain separate work.

Idle home now gives attention and recent work the full content width instead of reserving an empty Running card. The owned overview fixture verifies the running/idle transition. Host platform shortcut labels and accessible key descriptions use the preload platform value; Windows native command-search keyboard and repeat/composition fixtures pass. This does not establish full design, accessibility, macOS/Linux or live IME acceptance.

The conversation header now groups secondary actions in the same Base UI menu primitive used by the website, retaining settings as a direct action and at least 300 pixels for the title in audited windows. Native Windows menu opening/navigation/Escape and real export/fork/parent/pin/archive/handoff workflows have source and packaged coverage. Four additional captures bring the design audit to 150. Full screen-reader/multi-platform and feature parity acceptance remain open.

Fork availability now matches the runtime’s running/waiting guard. Source and packaged owned detail/overview fixtures verify that Fork, Handoff and Archive remain disabled without delivering commands or changing the selection, while pin/export remain available and the composer offers Queue. Eight additional captures bring the audit to 158. This is UI/runtime alignment, not proof of live native execution or complete parity.

The session-controls audit in `docs/session-controls.md` identifies the next native compaction work. OpenCode 2.0.22 exposes a compact endpoint and lifecycle events, while the current adapter forwards `/compact` as ordinary text. The installed OpenAI CLI 0.154.0 generated schema confirms the declared compact endpoint and contextCompaction item. Native execution, ordering/cancellation, durable activity and rollback consistency still require implementation and verification.

OpenCode native compaction supersedes the forwarding-only finding above. Bare attachment-free `/compact` now calls the native endpoint; automatic/manual confirmed summaries and failures persist as activities without replacing local messages. Nine protocol/runtime cases and owned source/packaged rendered fixtures cover dispatch, settlement, duplicate/foreign events, Stop/disconnect, SQLite reopening, exact copying and pending/retry draft preservation. The audit now produces 164 captures. Signed-in execution, streamed summary deltas, other-engine compaction, full resume behavior and rollback/snapshot consistency remain unchecked.

The transcript and composer now share a bounded reading column with native scrollbar compensation, and Jump to latest follows that column. Task-history rows have explicit vertical padding and title/status spacing. Source/packaged rendered checks enforce one-pixel edge/width alignment in both themes/window sizes; long-history workflows cover anchors, following and delayed resizing. This does not close overall visual acceptance or feature parity.

OpenAI compaction now supersedes its schema-only finding. Bare attachment-free `/compact` calls the native endpoint, waits for acknowledgement and matching turn completion, and records native compaction item state without fabricating a summary. Thirteen additional protocol/runtime cases cover ordering, duplicates/foreign/stale events, ordinary prompts, rejection, native failure, Stop/disconnection, steering and durable history. The production adapter also passes with the installed CLI and a fresh profile against an owned loopback provider, including native resume and actual item lifecycle. Source/packaged owned UI fixtures verify status-only layout, menu delivery and retained drafts; the audit now produces 168 captures. Signed-in provider execution, other-engine compaction, streamed OpenCode deltas, full resume and rollback/snapshot consistency remain open.

Claude tasks now share the native compaction menu action. SDK compacting status/boundaries persist exact native metadata; no-op commands retain native result/local/assistant output instead of claiming a boundary. Manual native compaction failure rejects the run, and Stop/unconfirmed endings retain failure feedback. Twelve SDK/runtime cases verify lifecycle, scope, duplicates, ordinary input and SQLite history/export. Owned source/packaged UI fixtures verify metadata/no-op copying, literal rendering and menu delivery, bringing the audit to 172 captures. The production adapter also passes the installed CLI 2.1.218 empty-history command against an isolated profile and loopback endpoint: one startup handshake, no inference. Actual signed-in boundary execution, other-engine compaction, complete resume/rollback/snapshot behavior and visual acceptance remain open.

Confirmed Claude boundary counts/duration now persist as structured activity data and render as readable metrics with consistent insets and numeric alignment. Missing values stay absent; zero remains valid; invalid values retain the original raw result. Original JSON starts collapsed and remains exactly copyable. Four additional deterministic cases and SQLite reopening checks cover metric projection/persistence; source/packaged UI fixtures cover values, spacing, disclosure and copying. The audit remains 172 captures. This improves one result surface without closing full visual or feature-parity acceptance.

Website-alignment feedback: use the web Card primitive's 20px inset consistently across panel headers and bodies; remove header dividers and enlarge explanatory panel text. Focused source/package visual audit covers both themes and both window sizes; overall design acceptance and product parity remain open.

Native harness discovery no longer leaves an empty header while waiting: visible loading/error/retry/empty states, preserved prior results, duplicate refresh protection, and collapsed native diagnostics now accompany a two-column installation list. Source/packaged owned IPC fixtures exercise these transitions across themes/window sizes (184 visual captures). Real installations and signed-in inference remain separate acceptance work; full parity remains unproven.

ACP and local MCP configuration now use individual literal argument fields with add/remove actions, new-field focus and consistent full-width spacing. Existing native string-array validation and argument limits remain authoritative. Owned rendered fixtures cover focus/removal/value fidelity; source/packaged real IPC workflows persist spaces, quotes, Unicode and empty arguments. The audit contains 188 captures. This improves configuration usability without claiming complete plugins/MCP or desktop parity.

ACP/MCP lists and forms now have separate New/Edit cards, native pending fieldsets, synchronous duplicate-save admission, inline draft-preserving failure feedback and edit focus/scrolling. Filtered lists render empty states. Source/packaged owned IPC save failures/retries and real smoke edit/archive/restore paths verify the interaction; the visual audit contains 204 captures. Full visual acceptance and feature parity remain open.
