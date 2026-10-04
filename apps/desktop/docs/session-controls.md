# Native session controls: evidence and remaining work

Baseline: T3 Code `737993303d36e10674c54b95e5bd3826682c99c7` and installed
`@opencode/client` 2.0.22. This is an implementation audit, not completed parity.

## Confirmed gaps

Phaseo's `AgentAdapter` currently exposes run, steering and cancellation.
The OpenCode adapter forwards all initial text through `session.prompt`, including
a bare `/compact`, and does not project native compaction events into activities.

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

## Next implementation and verification

Start with OpenCode's documented native compaction operation inside its existing
turn lifecycle. Subscribe before submitting, keep normal text-with-attachments
behavior, preserve the durable conversation and export, and record confirmed
compaction status/summary as activity. Cover manual dispatch, automatic events,
foreign-session events, failure, interrupted/disconnected streams and Stop with
owned protocol fixtures. Verify UI loading, completion and recovery through the
real desktop bridge before exposing a completed capability claim.

Then verify the installed OpenAI protocol and the other native engines' actual
session-control APIs. Add only supported operations. Rollback and file snapshots
remain a separate unchecked requirement: native session history, local durable
history and project file state must stay consistent across a rollback.
