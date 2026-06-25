# AI Stats Agent SDK

`@ai-stats/agent-sdk` is a TypeScript SDK for building agentic applications on top of AI Stats Gateway.

It is not a hosted orchestration platform. The package gives you:

- agent definitions
- multi-step model and tool loops
- gateway-backed model execution through `createGatewayAgentClient()`
- local runtime tools
- resumable runs from SDK-returned state
- human review pauses and resumes
- structured lifecycle events
- bounded model retries
- per-tool timeouts
- optional concurrent local tool execution with deterministic tool-result ordering

You own the surrounding application, any persistence you want around it, queues, and deployment model.

## State model

The SDK does not store runs in any AI Stats-hosted service.

`run()` returns the full agent state needed to continue later:

- the current run record
- the completed step records
- the full message history
- the parsed output, if the run completed

If your application wants resumability across requests, workers, or process restarts, persist that returned value however your application already persists workflow state.

## Install

```bash
pnpm add @ai-stats/sdk @ai-stats/agent-sdk
```

## Quickstart

```ts
import {
  createAgent,
  createGatewayAgentClient,
  defineTool,
} from "@ai-stats/agent-sdk";

const lookupDocs = defineTool({
  id: "lookup-docs",
  description: "Look up an internal docs page by slug.",
  parameters: {
    type: "object",
    properties: {
      slug: { type: "string" },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  async execute(input: { slug: string }) {
    return {
      slug: input.slug,
      url: `https://docs.ai-stats.phaseo.app/v1/${input.slug}`,
    };
  },
});

const agent = createAgent({
  id: "support-docs-agent",
  model: "ai-stats/free",
  instructions: "Use tools when helpful and finish with a concise answer.",
  tools: [lookupDocs],
});

const result = await agent.run({
  input: "Find the docs page for presets and explain when to use them.",
  client: createGatewayAgentClient({
    clientOptions: {
      apiKey: process.env.AI_STATS_API_KEY!,
    },
  }),
});

console.log(result.output);
```

## Devtools

Agent runs can write to the same `.ai-stats-devtools` session format used by `@ai-stats/sdk`.

```ts
import { createAgentDevtools } from "@ai-stats/agent-sdk";

const result = await agent.run({
  input: "Summarize this ticket.",
  client,
  devtools: createAgentDevtools({
    directory: ".ai-stats-devtools",
  }),
});
```

You can also enable capture process-wide with `AI_STATS_DEVTOOLS=true` and optionally set `AI_STATS_DEVTOOLS_DIR`.

## Core concepts

### Agent definition

Use `createAgent()` to define:

- one stable `id`
- instructions
- one model or preset
- a small tool list
- optional output parsing
- optional human review rules

Keep the first agent narrow. One workflow, one or two tools, one clear output shape.

### Gateway-backed execution

Use `createGatewayAgentClient()` when model turns should run through AI Stats Gateway.

The adapter can carry gateway-native controls such as:

- `responseFormat`
- `plugins`
- `gatewayTools`
- `toolChoice`
- `webSearchOptions`
- `providerOptions`
- `promptCacheKey`
- `includeMeta`

That lets the surrounding app keep routing, search, structured outputs, and plugin defaults in one place.

### Application-owned continuation

If a workflow pauses for review, or if you want to continue it later, persist the returned `AgentRunResult` in your own application and pass it back to `continueRun()`.

The SDK intentionally does not ship persistence adapters or a hosted state backend.

## Human review

Use `humanReview` when a run should pause for approval instead of continuing immediately.

```ts
const agent = createAgent({
  id: "support-agent",
  humanReview: ({ response }) =>
    response.message.content.includes("needs approval")
      ? {
          reason: "approval_required",
          payload: { draft: response.message.content },
        }
      : null,
});
```

Continue the paused run with explicit human input:

```ts
const continued = await agent.continueRun({
  run: pausedResult,
  client,
  humanInput: "Approved. Continue and return the final answer.",
});
```

## Output control

Use `parseOutput` when your application wants one typed final value:

```ts
const agent = createAgent<string, { summary: string }>({
  id: "summary-agent",
  parseOutput(text) {
    return JSON.parse(text) as { summary: string };
  },
});
```

For stricter model behavior, pair that with gateway structured outputs on the adapter:

```ts
const client = createGatewayAgentClient({
  clientOptions: { apiKey: process.env.AI_STATS_API_KEY! },
  responseFormat: {
    type: "json_schema",
    name: "agent_answer",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
  plugins: [{ id: "response-healing" }],
});
```

## Runtime controls

### Tool timeouts

Use `timeoutMs` when one local dependency should fail fast instead of hanging the whole run:

```ts
const fetchTicket = defineTool({
  id: "fetch-ticket",
  timeoutMs: 3_000,
  async execute(input: { ticketId: string }, context) {
    const response = await fetch(`https://internal.example/tickets/${input.ticketId}`, {
      signal: context.signal,
    });
    return await response.json();
  },
});
```

### Model retries

Use `modelRetry` when transient model failures should retry before the run is persisted as `failed`:

```ts
const agent = createAgent({
  id: "support-agent",
  modelRetry: {
    maxRetries: 2,
    backoffMs: 250,
  },
});
```

### Concurrent local tools

If one model turn can safely call several independent local tools, set `toolExecution.toolConcurrency`:

```ts
const agent = createAgent({
  id: "research-agent",
  toolExecution: {
    toolConcurrency: 3,
  },
  tools: [fetchDocs, fetchStatus, fetchIncidents],
});
```

The runtime still persists tool-result messages in tool-call order.

## Observability

Use `onEvent` when your application wants lifecycle hooks:

- `run.started`
- `run.resumed`
- `step.started`
- `step.completed`
- `step.failed`
- `step.cancelled`
- `model.requested`
- `model.completed`
- `model.failed`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `checkpoint.saved`
- `run.waiting_for_human`
- `run.cancelled`
- `run.completed`
- `run.failed`

If one step succeeds, the runtime emits `step.completed` after persisting the checkpointed step.
If model retries happen, the persisted step record exposes `modelAttempts`.
If a gateway request exposes request correlation data, the step can also persist `requestId` and `nativeResponseId`.

## Gateway errors

Gateway failures are rethrown as `AgentGatewayError`:

```ts
import { AgentGatewayError } from "@ai-stats/agent-sdk";

try {
  await agent.run({ input, client, store });
} catch (error) {
  if (error instanceof AgentGatewayError) {
    console.error(error.status, error.requestId, error.reason);
  }
  throw error;
}
```

If the failure came from the gateway, failed runs and steps also persist `errorDetails`.

## Included examples

- `examples/research-brief-agent.ts`
- `examples/support-triage-agent.ts`
- `examples/coding-review-agent.ts`
- `examples/parallel-tool-agent.ts`

## Scope

This package is intentionally an SDK, not a platform:

- no hosted orchestration
- no bundled remote checkpoint backend
- no opinionated queue or worker runtime

Build those parts in your own application around the exported primitives.
