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

## Verification and remaining work

Nine deterministic protocol/runtime cases cover native admission rejection, manual dispatch, automatic events, exact summary text, duplicate and foreign events, settlement, failure, Stop and disconnection. A real SQLite fixture checks original messages, reopening and unchanged conversation export history. Owned source and Windows-archive UI fixtures check exact summary copying, literal markup/Unicode, duplicate delivery suppression, failure/retry and retained drafts across themes/window sizes. These fixtures do not establish signed-in native execution.

OpenAI and other native engines' compaction remain unimplemented. Live provider event ordering, streamed compaction deltas and full resume behavior remain unverified. Rollback and file snapshots remain separate unchecked requirements: native session history, local durable history and project file state must stay consistent across a rollback.
