# Native session controls: evidence and remaining work

Baseline: T3 Code `737993303d36e10674c54b95e5bd3826682c99c7` and installed
`@opencode/client` 2.0.22. This is an implementation audit, not completed parity.

## Implemented OpenCode controls

An attachment-free, trimmed `/compact` now uses the native `session.compact` endpoint within the existing turn lifecycle. Initialized OpenCode tasks expose Compact context in the task menu. Active, archived and pending tasks disable the action; request delivery preserves the composer draft and attachments.

Manual and automatic lifecycle events produce compaction activities. Confirmed summaries preserve exact native text; structured failures and streams ending without completion retain explicit failure feedback. Foreign-session and duplicate lifecycle events are ignored. Local messages remain intact; summaries do not fabricate assistant messages.

The pinned T3 OpenCode adapter routes an attachment-free `/compact` to
`session.compact({ sessionID, id })`. It handles automatic and manual
`session.compaction.started`, `.ended` and `.failed` events separately from text
and ordinary tool results. The installed client declares these events and the
compact endpoint. The ended event carries the native summary in `data.text`;
started/failed events can carry `inputID`, while all three identify the session.

The pinned T3 OpenAI adapter requests `thread/compact/start` for the native thread
and tracks the operation as a turn. The installed OpenAI CLI 0.154.0 generated
its standard TypeScript schema into the owned ignored directory
`.tmp/desktop-references/codex-protocol-0.154.0-20261004`. Its request union
includes `thread/compact/start`, with `{ threadId: string }` parameters and an
empty response. `ThreadItem` includes `contextCompaction`; the old
`ContextCompactedNotification` is explicitly deprecated. Schema presence proves
the declared interface, not successful signed-in execution or event ordering.

Reference implementations:

- [OpenCode adapter](https://github.com/pingdotgg/t3code/blob/737993303d36e10674c54b95e5bd3826682c99c7/apps/server/src/orchestration-v2/Adapters/OpenCode2AdapterV2.ts)
- [OpenAI adapter](https://github.com/pingdotgg/t3code/blob/737993303d36e10674c54b95e5bd3826682c99c7/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts)

## Implemented OpenAI controls

Bare, attachment-free `/compact` now calls `thread/compact/start`. Request acknowledgement and the matching native turn completion are both required before settling. Native `contextCompaction` items project running/completed activity with their actual item identity; duplicate, foreign and stale events are ignored. Unfinished items retain native failure details or explicit unconfirmed-completion feedback. Manual compaction rejects steering, while queued input remains available. Ordinary text and attachments retain the normal prompt path.

The menu now exposes Compact context for initialized OpenAI and OpenCode tasks. OpenAI's declared item has no summary field: the renderer shows status without an empty source pane or Copy button. It does not fabricate a summary or replace local messages.

Primary protocol evidence: [OpenAI app-server compaction](https://developers.openai.com/codex/app-server/#trigger-thread-compaction) and the installed CLI 0.154.0 schema.

## Implemented Claude controls

Initialized Claude tasks share Compact context in the task menu. Bare manual commands use the SDK's native `/compact` path and retain the selected resume/fork and permission settings. Native compacting status and `compact_boundary` messages project running/completed activity; boundaries preserve exact metadata, including the native manual/automatic trigger. Metadata is not presented as a generated summary. Valid native token counts/duration are persisted separately for the readable metric row; absent/invalid values are not invented. The full native JSON remains available behind Original result and through exact copying. Duplicate and foreign-session lifecycle messages are ignored. Explicit manual compaction failure rejects the run; interrupted streams retain unconfirmed completion.

A successful command without a boundary is shown as Compaction result. The adapter retains native result text, local command output or native assistant output, including the installed CLI's empty-history explanation. An empty native result with no output retains an explicit lack-of-confirmation message. No local history is replaced.

Reference: [Claude SDK command contract](https://code.claude.com/docs/en/agent-sdk/slash-commands#compact-history-with-compact), installed SDK 0.3.276 declarations and the pinned [T3 Claude adapter](https://github.com/pingdotgg/t3code/blob/737993303d36e10674c54b95e5bd3826682c99c7/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts).

## Verification and remaining work

OpenCode has nine deterministic protocol/runtime cases. OpenAI adds thirteen cases covering request/event ordering, manual/automatic dispatch, turn matching, duplicates, admission rejection, native failure, Stop/disconnection, steering, unchanged prompts and SQLite reopening/export history. Source and Windows-archive UI fixtures verify exact OpenCode summary copying and OpenAI status-only layout, delivered menu commands and retained drafts across themes/window sizes.

`pnpm --filter @phaseo/desktop exec node scripts/native-compaction-smoke.mjs` compiles the production OpenAI adapter and runs the installed native CLI against an owned loopback provider and a fresh temporary profile. It verifies seed output, native resume, two provider requests, matching compaction item lifecycle and turn settlement. No user account, copied credentials or paid provider is used. This proves the installed process integration against the owned fixture; signed-in service execution remains unverified. The script requires the native CLI on PATH and does not run as part of the deterministic suite.

Claude adds sixteen deterministic SDK/runtime cases covering confirmed metadata, duplicates, foreign sessions, native output/no-op/failure, Stop, ordinary attached input and durable history/export. Owned source/packaged UI fixtures check exact metadata and no-op copying, literal text, result labelling and menu delivery across themes/window sizes.

`pnpm --filter @phaseo/desktop exec node scripts/claude-compaction-smoke.mjs` compiles the production adapter and runs the installed CLI (verified with 2.1.218) using an empty temporary profile and owned loopback endpoint. The native no-op explanation is retained without claiming a boundary. The fixture permits only the observed `/api/hello` startup handshake; any inference request fails the check. This proves the native empty-history path, not successful paid/signed-in compaction.

Pi supports bare `/compact` through native RPC, resumes the selected session, disables tools during manual compaction and waits for native idle confirmation. Successful native summaries use the existing safe Markdown renderer; Original result and Copy retain the full native JSON, including heuristic token estimates without labelling them exact. Current and legacy automatic compaction events retain outcomes; cancellation and unfinished results remain explicit. Fifteen protocol/runtime cases cover ordering, cancellation, failures and SQLite reopening. The desktop smoke workflow runs the production adapter against an owned RPC CLI fixture and clicks the rendered menu action. Pi is not installed locally; signed-in Pi inference remains unverified. Reference: [official RPC commands](https://github.com/earendil-works/pi/blob/200387122ca450d6387f033949423114a270b96c/packages/coding-agent/docs/rpc-commands.md).

Compaction for remaining engines, live provider event ordering/failure recovery, streamed OpenCode summary deltas and full resume behavior remain open. Rollback and file snapshots remain separate unchecked requirements: native session history, local durable history and project file state must stay consistent across rollback.

Phaseo Code and Plan use enabled MCP connections matching the conversation project, including global connections. Every server tool call asks for approval with the server and tool name. A failed setup retains the queued instruction for retry before any model input is submitted. Discovery supports stdio and Streamable HTTP; setup is bounded to 30 seconds, calls to 60 seconds, and results to 1 MB. Custom connection credentials/OAuth, elicitation, resources and prompts remain unavailable. Source and packaged Electron bridge audits cover real owned stdio/HTTP servers without provider inference.
