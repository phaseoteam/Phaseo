---
name: phaseo-agent-sdk-typescript
description: Build agentic applications with the TypeScript Agent SDK (`@phaseo/agent-sdk`) on top of Phaseo Gateway. Use when repositories need local tool loops, resumable runs from app-owned state, or a gateway-backed agent client through `@phaseo/sdk`.
---

# Phaseo Agent SDK TypeScript

Use this skill when the repository should implement agent-style workflows through `@phaseo/agent-sdk`.

## Outcome
Deliver a working agent integration that:
- defines one clear `createAgent()` entrypoint
- reads credentials from `PHASEO_API_KEY`
- uses `createGatewayAgentClient()` for live gateway execution
- supports resumable runs from application-owned state
- can retry bounded transient model failures before persisting a terminal run failure
- can target dashboard-managed preset routing directly instead of hard-coding one model id in application code
- can carry gateway-native controls such as structured outputs, managed search tools, plugin policy, and tool choice when the workflow needs them
- keeps runtime tools small and deterministic
- can fan out multiple independent local tool calls concurrently without losing deterministic tool-result ordering

## Workflow
1. Create or reuse one shared gateway client path through `createGatewayAgentClient()`.
2. Keep the first agent narrow: one agent and one or two tools.
3. Keep one-shot runs simple and in-process.
4. If the app needs resumability, persist the returned run state in the repo's own database, cache, or workflow record instead of adding an SDK-owned persistence layer.
5. If transient provider/model failures are acceptable, set a bounded `modelRetry` policy on the agent or the specific run instead of requeueing blindly outside the SDK.
6. If routing, prompts, or parameter defaults should stay outside application code, prefer `preset` on the agent or run over manually hard-coding `model: "@slug"` strings everywhere.
7. Treat tool inputs and outputs as durable step data, not transient console output.
8. If one agent family should always use managed search or strict JSON, configure that once on `createGatewayAgentClient()` with `gatewayTools`, `toolChoice`, `responseFormat`, and `plugins`.
9. If one model turn can safely call several local tools independently, use `toolExecution.toolConcurrency` instead of manually splitting the workflow across multiple agent steps.
10. Validate the exact run loop you changed, not just the package import surface.

## Canonical setup

```ts
import {
  createAgent,
  createGatewayAgentClient,
  defineTool,
} from "@phaseo/agent-sdk";

const lookupDocs = defineTool({
  id: "lookup-docs",
  description: "Look up internal docs by slug.",
  async execute(input: { slug: string }) {
    return { slug: input.slug };
  },
});

const agent = createAgent({
  id: "docs-agent",
  model: "phaseo/free",
  instructions: "Use tools when helpful and finish with a concise answer.",
  tools: [lookupDocs],
});

const result = await agent.run({
  input: "Find the docs page for presets.",
  client: createGatewayAgentClient({
    clientOptions: {
      apiKey: process.env.PHASEO_API_KEY!,
    },
  }),
});
```

## Rules

- Prefer the Responses API-backed adapter for new agent loops.
- Keep system instructions on the agent definition, not duplicated in every call site.
- Keep returned run state owned by the application rather than introducing an SDK-level persistence subsystem.
- If the repo needs approval points, leave clear seams for pause/continue instead of hiding review inside a tool callback.
- Log run ids and gateway request ids when the surrounding app already has operational logging.
- If one workflow always needs grounded research, prefer adapter-level `gatewayTools` plus `toolChoice` over rebuilding upstream-native tool definitions at every run call.
- For coding-style workflows, prefer a small set of local runtime tools plus an explicit `humanReview` seam over one generic upstream-managed tool surface.
- Use persisted `requestId`, `nativeResponseId`, and `modelAttempts` on step records when the surrounding application needs a stable correlation bridge back to gateway logs and upstream responses.
- Catch `AgentGatewayError` when application code needs to distinguish policy blocks, provider diagnostics, or routing failures from generic transport errors.
- Expect failed runs and steps caused by `AgentGatewayError` to persist `errorDetails`.
- Use `step.failed`, `step.completed`, `run.resumed`, `model.failed`, or `tool.failed` when the application needs exact lifecycle hooks instead of inferring state from generic logs.
- Use `includeMeta: true` on `createGatewayAgentClient()` when successful steps should retain gateway response metadata such as routing or plugin execution details on `responseMeta`.
- Expect model failures that still throw after the configured retries, or thrown tool/parse-output failures, to persist both the run and the active step as `failed`.
- Expect retrying model steps to persist `modelAttempts`.
- Expect concurrent local tool execution to preserve tool-result message order even when tool completion order differs.
- Define `parameters` on local runtime tools when the model should target a constrained JSON input contract instead of a generic free-form object payload.

## Validation

- one successful local build or typecheck on the agent package or module you changed
- one docs/example path that reflects the shipped API if the SDK surface changed
- one end-to-end run or a deterministic mocked run loop when the repository supports it
