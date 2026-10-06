import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as Acp from "@agentclientprotocol/sdk";
import type { AgentEvent, AgentMessage, AgentModelClient } from "@phaseo/agent-sdk";
import { HarnessSessionStore, type HarnessSession } from "./sessionStore.js";
import { runPhaseoHarness, phaseoClient, type HarnessCallbacks } from "./runner.js";
import type { McpConnection } from "./legacy/shared/mcp.js";
import { formAnswerError, type FormAnswer } from "./legacy/shared/agentForms.js";

const toolKind = (name: string): Acp.ToolKind =>
  name === "run_project_command"
    ? "execute"
    : name === "write_project_file"
      ? "edit"
      : ["project_files", "list_skills", "load_skill"].includes(name)
        ? "read"
        : "other";
const toolTitle = (name: string) =>
  (
    ({
      run_project_command: "Run command",
      write_project_file: "Edit file",
      project_files: "Inspect files",
      list_skills: "List skills",
      load_skill: "Load skill",
      update_plan: "Update plan",
      ask_user: "Ask for input",
    }) as Record<string, string>
  )[name] ?? name;

/** ACP cancellation is cooperative; stopping the SDK must not wait for a late dialog response. */
function abortable<A>(promise: Promise<A>, signal: AbortSignal): Promise<A> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(new Error("Phaseo turn cancelled."));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Phaseo turn cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function mcpConnections(servers: Acp.McpServer[]): McpConnection[] {
  return servers.map((server) => {
    if (!("command" in server) && server.type !== "http")
      throw new Error("Phaseo supports stdio and HTTP MCP servers.");
    return {
      id: NodeCrypto.createHash("sha256").update(server.name).digest("hex").slice(0, 32),
      name: server.name,
      enabled: true,
      ...("command" in server
        ? {
            transport: "stdio" as const,
            executable: server.command,
            arguments: server.args,
            environment: Object.fromEntries(
              server.env.map((variable) => [variable.name, variable.value]),
            ),
          }
        : {
            transport: "http" as const,
            url: server.url,
            headers: Object.fromEntries(
              server.headers.map((header) => [header.name, header.value]),
            ),
          }),
    };
  });
}

export function createPhaseoAcpAgent(options: {
  stateDirectory: string;
  globalInstructionsRoot: string;
  models: { slug: string; name: string }[];
  client: AgentModelClient | ((sessionId: string) => AgentModelClient);
}) {
  if (!options.models.length) throw new Error("No available Phaseo models.");
  const store = new HarnessSessionStore(NodePath.join(options.stateDirectory, "sessions"));
  const sessions = new Map<
    string,
    { state: HarnessSession; mcp: McpConnection[]; controller?: AbortController }
  >();
  const get = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw new Error("Phaseo session is not loaded.");
    return session;
  };
  const setup = (state: HarnessSession) => ({
    modes: {
      currentModeId: state.mode,
      availableModes: [
        { id: "default", name: "Default" },
        { id: "plan", name: "Plan" },
      ],
    },
    models: {
      currentModelId: state.model,
      availableModels: options.models.map((model) => ({ modelId: model.slug, name: model.name })),
    },
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model" as const,
        type: "select" as const,
        currentValue: state.model,
        options: options.models.map((model) => ({ value: model.slug, name: model.name })),
      },
    ],
  });
  const load = async (id: string, cwd: string, servers: Acp.McpServer[]) => {
    const state = await store.load(id);
    if ((await NodeFSP.realpath(cwd)) !== state.cwd)
      throw new Error("This Phaseo session belongs to a different workspace.");
    if (sessions.get(id)?.controller) throw new Error("Phaseo session is busy.");
    sessions.set(id, { state, mcp: mcpConnections(servers) });
    return state;
  };
  const app = Acp.agent({ name: "phaseo-desktop" })
    .onRequest("initialize", () => ({
      protocolVersion: Acp.PROTOCOL_VERSION,
      agentInfo: { name: "Phaseo", version: "0.1.0" },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true, embeddedContext: true },
        mcpCapabilities: { http: true },
        sessionCapabilities: { fork: {}, resume: {} },
      },
      authMethods: [],
    }))
    .onRequest("session/new", async ({ params }) => {
      const state: HarnessSession = {
        version: 1,
        id: NodeCrypto.randomUUID(),
        cwd: await NodeFSP.realpath(params.cwd),
        model: options.models[0]!.slug,
        mode: "default",
        messages: [],
      };
      await store.save(state);
      sessions.set(state.id, { state, mcp: mcpConnections(params.mcpServers) });
      return { sessionId: state.id, ...setup(state) };
    })
    .onRequest("session/load", async ({ params, client }) => {
      const state = await load(params.sessionId, params.cwd, params.mcpServers);
      for (const message of state.messages) {
        if (message.role !== "assistant" && message.role !== "user") continue;
        const content =
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n");
        if (content)
          await client.notify("session/update", {
            sessionId: state.id,
            update: {
              sessionUpdate:
                message.role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
              content: { type: "text", text: content },
            },
          });
      }
      return setup(state);
    })
    .onRequest("session/resume", async ({ params }) =>
      setup(await load(params.sessionId, params.cwd, params.mcpServers ?? [])),
    )
    .onRequest("session/fork", async ({ params }) => {
      if (sessions.get(params.sessionId)?.controller)
        throw new Error("Finish the active turn before branching.");
      const source = await store.load(params.sessionId);
      const state: HarnessSession = {
        ...source,
        id: NodeCrypto.randomUUID(),
        cwd: await NodeFSP.realpath(params.cwd),
        result: undefined,
        messages: source.result?.messages ?? source.messages,
      };
      await store.save(state);
      sessions.set(state.id, { state, mcp: mcpConnections(params.mcpServers ?? []) });
      return { sessionId: state.id, ...setup(state) };
    })
    .onRequest("session/set_mode", async ({ params }) => {
      const session = get(params.sessionId);
      if (session.controller || !["default", "plan"].includes(params.modeId))
        throw new Error("Cannot change this Phaseo session mode.");
      session.state.mode = params.modeId as HarnessSession["mode"];
      await store.save(session.state);
      return {};
    })
    .onRequest("session/set_config_option", async ({ params }) => {
      const session = get(params.sessionId);
      if (
        session.controller ||
        params.configId !== "model" ||
        typeof params.value !== "string" ||
        !options.models.some((model) => model.slug === params.value)
      )
        throw new Error("Select an available Phaseo model.");
      session.state.model = params.value;
      await store.save(session.state);
      return { configOptions: setup(session.state).configOptions };
    })
    .onNotification("session/cancel", ({ params }) => {
      sessions.get(params.sessionId)?.controller?.abort();
    })
    .onRequest("session/prompt", async ({ params, client, signal }) => {
      const session = get(params.sessionId);
      if (session.controller) throw new Error("Phaseo session is already running.");
      const controller = new AbortController();
      session.controller = controller;
      const runSignal = AbortSignal.any([signal, controller.signal]);
      type UserContent = Exclude<
        Extract<AgentMessage, { role: "user" }>["content"],
        string
      >[number];
      const prompt: AgentMessage = {
        role: "user",
        content: params.prompt.flatMap<UserContent>((block) => {
          if (block.type === "text") return [{ type: "text" as const, text: block.text }];
          if (block.type === "image")
            return [
              {
                type: "image_url" as const,
                image_url: { url: `data:${block.mimeType};base64,${block.data}` },
              },
            ];
          if (block.type === "resource" && "text" in block.resource)
            return [{ type: "text" as const, text: block.resource.text }];
          if (block.type === "resource_link")
            return [{ type: "text" as const, text: `${block.name}: ${block.uri}` }];
          throw new Error("This attachment is not supported by Phaseo.");
        }),
      };
      const existing = session.state.result?.messages ?? session.state.messages;
      const messages = [...existing, prompt];
      const textSteps = new Set<number>(),
        thinkingSteps = new Set<number>();
      const toolNames = new Map<string, string>();
      const toolInputs = new Map<string, unknown>();
      const nativeToolIds = new Map<string, string>();
      const nativeToolId = (id: string, runId?: string) => {
        if (runId) nativeToolIds.set(id, `${runId}:${id}`);
        return nativeToolIds.get(id) ?? id;
      };
      let queued = Promise.resolve();
      const send = (update: Acp.SessionUpdate) =>
        client.notify("session/update", { sessionId: params.sessionId, update });
      const queue = (update: Acp.SessionUpdate) => {
        queued = queued.then(() => send(update));
        void queued.catch(() => {});
      };
      const callbacks: HarnessCallbacks = {
        onDelta: (_id, text) =>
          queue({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } }),
        onActivity: (activity) => {
          if (activity.type === "plan") {
            queue({
              sessionUpdate: "plan",
              entries: (activity.steps ?? []).map((step) => ({
                content: step.status === "cancelled" ? `[Cancelled] ${step.text}` : step.text,
                status: step.status === "cancelled" ? "completed" : step.status,
                priority: "medium",
              })),
            });
            return;
          }
          if (activity.type === "tool")
            queue({
              sessionUpdate: "tool_call",
              toolCallId: activity.id,
              title: activity.title,
              kind: "read",
              status:
                activity.status === "failed"
                  ? "failed"
                  : activity.status === "running"
                    ? "in_progress"
                    : "completed",
              content: [{ type: "content", content: { type: "text", text: activity.text } }],
            });
        },
        onApproval: async (method, description, toolCallId = NodeCrypto.randomUUID()) => {
          await queued;
          runSignal.throwIfAborted();
          const response = await abortable(
            client.request(
              "session/request_permission",
              {
                sessionId: params.sessionId,
                toolCall: {
                  toolCallId: nativeToolId(toolCallId),
                  title: toolTitle(method),
                  kind: toolKind(toolNames.get(toolCallId) ?? method),
                  status: "pending",
                  rawInput: toolInputs.get(toolCallId),
                  content: [{ type: "content", content: { type: "text", text: description } }],
                },
                options: [
                  { optionId: "allow", name: "Allow once", kind: "allow_once" },
                  { optionId: "reject", name: "Decline", kind: "reject_once" },
                ],
              },
              { cancellationSignal: runSignal },
            ),
            runSignal,
          );
          runSignal.throwIfAborted();
          return response.outcome.outcome === "selected" && response.outcome.optionId === "allow"
            ? "accept"
            : "decline";
        },
        onQuestion: async (questions) => {
          const answers = await abortable(
            client.request<Record<string, unknown> | null>(
              "_phaseo/ask_user",
              {
                sessionId: params.sessionId,
                nativeItemId: `${params.sessionId}:question:${NodeCrypto.randomUUID()}`,
                questions: questions.map((question) => ({
                  id: question.id,
                  header: question.header,
                  question: question.question,
                  options: (question.options ?? []).map((option) => ({
                    label: option.label,
                    description: option.description?.trim() || option.label,
                  })),
                  allowCustomAnswer: question.isOther !== false,
                  multiSelect: question.multiSelect ?? false,
                  required: true,
                })),
              },
              { cancellationSignal: runSignal },
            ),
            runSignal,
          );
          if (!answers) throw new Error("Question cancelled.");
          return Object.fromEntries(
            questions.map((question) => {
              const value = answers[question.id];
              return [
                question.id,
                Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [],
              ];
            }),
          );
        },
        onForm: async (form) => {
          const properties: Record<string, Acp.ElicitationPropertySchema> = {};
          for (const field of form.fields) {
            const common = {
              title: field.title ?? field.key,
              description: field.description ?? undefined,
            };
            if (field.type === "external")
              properties[field.key] = {
                type: "boolean",
                title: common.title,
                description: `Complete verification at ${field.url}, then confirm.`,
              };
            else if (field.type === "string")
              properties[field.key] = {
                ...common,
                type: "string",
                ...(field.options ? { enum: field.options.map((option) => option.value) } : {}),
                ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
                ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
              };
            else if (field.type === "number" || field.type === "integer")
              properties[field.key] = {
                ...common,
                type: field.type,
                minimum: field.minimum,
                maximum: field.maximum,
              };
            else if (field.type === "boolean")
              properties[field.key] = { ...common, type: "boolean" };
            else if (field.type === "multiselect")
              properties[field.key] = {
                ...common,
                type: "array",
                items: { type: "string", enum: field.options.map((option) => option.value) },
                minItems: field.minItems,
                maxItems: field.maxItems,
              };
          }
          const response = await abortable(
            client.request(
              "elicitation/create",
              {
                sessionId: params.sessionId,
                mode: "form",
                message: form.title ?? "MCP needs your input.",
                requestedSchema: {
                  type: "object",
                  properties,
                  required: form.fields
                    .filter((field) => field.type === "external" || field.required)
                    .map((field) => field.key),
                },
              },
              { cancellationSignal: runSignal },
            ),
            runSignal,
          );
          if (
            response.action !== "accept" ||
            !response.content ||
            typeof response.content !== "object"
          )
            return null;
          const answer = response.content as FormAnswer;
          if (formAnswerError(form, answer)) return null;
          return answer;
        },
      };
      const onEvent = async (event: AgentEvent) => {
        await queued;
        if (event.type === "response.output_text.delta") {
          textSteps.add(event.stepIndex);
          await send({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: event.delta },
          });
        } else if (event.type === "response.reasoning.delta") {
          thinkingSteps.add(event.stepIndex);
          await send({
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: event.delta },
          });
        } else if (event.type === "run.waiting_for_human") {
          for (const entry of event.pause.pendingToolCalls ?? []) {
            toolNames.set(entry.call.id, entry.call.name);
            toolInputs.set(entry.call.id, entry.call.input);
            await send({
              sessionUpdate: "tool_call",
              toolCallId: nativeToolId(entry.call.id, event.runId),
              title: toolTitle(entry.call.name),
              kind: toolKind(entry.call.name),
              rawInput: entry.call.input,
              status: "pending",
            });
          }
        } else if (event.type === "response.item") {
          if (event.item.type === "message" && !textSteps.has(event.stepIndex)) {
            textSteps.add(event.stepIndex);
            await send({
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: event.item.content },
            });
          }
          if (event.item.type === "reasoning" && !thinkingSteps.has(event.stepIndex)) {
            thinkingSteps.add(event.stepIndex);
            await send({
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: event.item.text },
            });
          }
          if (event.item.type === "tool_call") {
            toolNames.set(event.item.toolCallId, event.item.name);
            toolInputs.set(event.item.toolCallId, event.item.input);
            await send({
              sessionUpdate: "tool_call",
              toolCallId: nativeToolId(event.item.toolCallId, event.runId),
              title: toolTitle(event.item.name),
              kind: toolKind(event.item.name),
              status: "pending",
              rawInput: event.item.input,
            });
          }
        } else if (
          event.type === "tool.started" ||
          event.type === "tool.completed" ||
          event.type === "tool.failed"
        ) {
          await send({
            sessionUpdate: "tool_call_update",
            toolCallId: nativeToolId(event.toolCallId, event.runId),
            title: toolTitle(event.toolName),
            kind: toolKind(event.toolName),
            status:
              event.type === "tool.started"
                ? "in_progress"
                : event.type === "tool.failed"
                  ? "failed"
                  : "completed",
            ...(event.type !== "tool.started"
              ? {
                  rawOutput: event.output ?? event.error,
                  content: [
                    {
                      type: "content" as const,
                      content: {
                        type: "text" as const,
                        text: event.error ?? JSON.stringify(event.output ?? "", null, 2),
                      },
                    },
                  ],
                }
              : {}),
          });
        }
      };
      const previousUsage =
        session.state.result?.run.status !== "completed" ? session.state.result?.usage : undefined;
      try {
        const result = await runPhaseoHarness({
          cwd: session.state.cwd,
          model: session.state.model,
          messages,
          previous: session.state.result,
          globalInstructionsRoot: options.globalInstructionsRoot,
          writable: session.state.mode !== "plan",
          signal: runSignal,
          callbacks,
          mcpConnections: session.mcp,
          client:
            typeof options.client === "function"
              ? options.client(session.state.id)
              : options.client,
          onEvent,
          save: async (result) => {
            session.state.result = result;
            session.state.messages = result.messages;
            await store.save(session.state);
          },
        });
        await queued;
        const usage = result.usage;
        return {
          stopReason: "end_turn" as const,
          ...(usage
            ? {
                usage: {
                  inputTokens: Math.max(0, usage.inputTokens - (previousUsage?.inputTokens ?? 0)),
                  outputTokens: Math.max(
                    0,
                    usage.outputTokens - (previousUsage?.outputTokens ?? 0),
                  ),
                  totalTokens: Math.max(0, usage.totalTokens - (previousUsage?.totalTokens ?? 0)),
                  cachedReadTokens: Math.max(
                    0,
                    usage.cachedTokens - (previousUsage?.cachedTokens ?? 0),
                  ),
                },
              }
            : {}),
        };
      } catch (error) {
        await queued.catch(() => {});
        if (runSignal.aborted) return { stopReason: "cancelled" as const };
        throw new Acp.RequestError(
          -32603,
          error instanceof Error ? error.message : "Phaseo run failed.",
        );
      } finally {
        session.controller = undefined;
      }
    });
  return app;
}

export async function runPhaseoHarnessStdio() {
  const directory = process.env.PHASEO_HARNESS_HOME;
  const key = process.env.PHASEO_GATEWAY_TOKEN;
  if (!directory || !NodePath.isAbsolute(directory) || !key)
    throw new Error("Phaseo runtime configuration is unavailable.");
  const modelsFile = process.env.PHASEO_HARNESS_MODELS;
  if (!modelsFile || !NodePath.isAbsolute(modelsFile))
    throw new Error("Phaseo model catalog is unavailable.");
  const models = JSON.parse(await NodeFSP.readFile(modelsFile, "utf8")) as {
    slug: string;
    name: string;
  }[];
  if (
    !Array.isArray(models) ||
    models.length > 10_000 ||
    models.some((model) => typeof model.slug !== "string" || typeof model.name !== "string")
  )
    throw new Error("Invalid Phaseo model catalog.");
  const app = createPhaseoAcpAgent({
    stateDirectory: directory,
    globalInstructionsRoot: NodePath.join(directory, "..", "..", "..", "instructions"),
    models,
    client: (sessionId) => phaseoClient(key, process.env.PHASEO_CHAT_ID || sessionId),
  });
  const connection = app.connect(
    Acp.ndJsonStream(
      NodeStream.Writable.toWeb(process.stdout),
      NodeStream.Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
    ),
  );
  await connection.closed;
}
