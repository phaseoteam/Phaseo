# Google stream safety

Google, AI Studio and Vertex Gemini now share one native translator. It uses
the shared bounded SSE parser, pull-driven output, strict UTF-8/JSON, bounded
JSON fallback and abortable source reads. It does not retain plain streamed
output or reread the full response at EOF. The legacy duplicate Google parser
has been removed.

Gemini success requires all observed candidates to have a native finish reason;
Interactions requires interaction.completed. EOF or a supplied DONE alone cannot
complete an unfinished response. Usage-only frames after candidate completion
remain included. Empty output and native errors propagate as canonical failures,
with credential ownership retained and no raw provider message in errors/logs.
Google's native contract is documented at
[GenerateContentResponse](https://ai.google.dev/api/generate-content).

Candidate/step/tool state is bounded to 128, identities to 1,024 characters,
retained tool argument state to 4 Mi characters. Each event's translated queue
is bounded to 128 frames / 16 MiB; ordinary text streams do not accumulate into
that budget. Divergent tool argument snapshots fail instead of corrupting JSON.
Final tool-only finish frames preserve tool_calls even without repeated deltas.

Cancellation at this adapter releases its source, including while sniffing a
prefix or waiting for data. The outer billed after-stage still drains on client
disconnect pending the separate provider cancellation/usage-recovery policy.
Cross-protocol Responses compatibility still accumulates bounded snapshots.

Validation: 605 source files / 4,716 tests pass; typecheck, focused lint (existing
file-length warning), Worker dry-run and native Workers framing/usage/truncation/
cancellation checks pass. Staging checks pending. No production deployment or
paid Google request is authorized by this stage. Poolside checks are gateway
regression evidence, not live Google-provider validation.
