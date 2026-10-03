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
Use existing Phaseo desktop tokens and frame as the visual source of truth.

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
interactive terminal sign-in remains a gap.
OpenCode session forms support typed values, conditional/default fields,
explicit external acknowledgements, cancellation and native validation retries.
Provider-defined patterns are validated by OpenCode rather than evaluated in
Electron's main process. Pending form rediscovery after reconnect remains a gap.
Phaseo Code/Plan currently accepts text documents; images require Chat or a
vision-capable native harness. PDF OCR is not implemented.

Evidence: desktop lint/typecheck/build pass; 81 deterministic tests cover protocol,
queue ordering, cancellation, secret storage, filesystem boundaries, stream framing,
and SDK approval continuation. An isolated Electron smoke test verified task CRUD,
IPC validation, renderer navigation, real PTY execution, editor saving and stale-edit
rejection, Git staging/commits, command search, attachment imports and PDF previews.
Protocol-shaped renderer fixtures check form defaults, conditional visibility,
numeric bounds and choices; native form replies have separate runtime coverage.
The same checks pass against the Windows packaged archive. Pi fixtures
verify that agent_end does not finish a task and compaction must settle first.
Live paid inference and real provider login
have not been exercised. Broad ledger items stay unchecked until all their parts
have runtime and UI coverage. The desktop smoke command is `pnpm --filter
@phaseo/desktop test:desktop`; it uses a fresh temporary user-data directory.

Validation: desktop lint, typecheck, deterministic unit/integration tests, builds,
and rendered desktop workflows. Live paid inference requires the user's
authorized credentials and must be reported separately from fixture evidence.
