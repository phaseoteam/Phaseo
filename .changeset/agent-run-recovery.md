---
"@phaseo/agent-sdk": minor
---

Keep agent runs usable after failures:
- With `onError: "return-to-model"`, unknown tools, unreadable tool arguments (`AgentToolCall.inputError`) and invalid inputs come back to the model as error results.
- Continuing a run answers any tool call a failure left without a result (`history.repaired` event, `repairToolHistory`).
- `maxSteps` counts the steps of each run or continue call, so a run that used its budget can be continued.

Model retries now back off exponentially with full jitter and honour `Retry-After`. Only retryable errors are retried (`agentErrorIsRetryable`, or `modelRetry.retryOn`), and never after output has streamed. A `model.retrying` event reports each wait.

The gateway client treats these as failures (`AgentStreamError`), not completed answers:
- error events;
- failed, incomplete and cancelled responses;
- connections dropped partway through;
- streams that end without completing.

`streamIdleTimeoutMs` abandons a stream that goes quiet.

New options:
- `toolExecution.maxOutputChars` keeps the start and end of long tool output.
- `activeTools` offers a subset of the registered tools.
- `prepareMessages` can compact the history before each request, and once after a context-overflow error (`agentErrorIsContextOverflow`).
- `takeMessages` adds steering messages at the next step.
- `parallelSafe` tools run side by side.

Tool output that isn't a string is now sent as compact JSON.
