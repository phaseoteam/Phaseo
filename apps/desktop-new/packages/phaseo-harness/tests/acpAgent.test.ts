import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import * as Acp from "@agentclientprotocol/sdk";
import type { AgentModelClient, AgentModelRequest } from "@phaseo/agent-sdk";
import { describe, expect, it, vi } from "vite-plus/test";
import { createPhaseoAcpAgent } from "../src/acpAgent.js";
import { HarnessSessionStore } from "../src/sessionStore.js";

const models = [
  { slug: "lab/model", name: "Model" },
  { slug: "lab/second", name: "Second" },
];
const fixture = async (
  model: AgentModelClient | ((sessionId: string) => AgentModelClient),
  permission: (
    request: Acp.RequestPermissionRequest,
  ) => Promise<Acp.RequestPermissionResponse> = async () => ({
    outcome: { outcome: "selected", optionId: "allow" },
  }),
) => {
  const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "phaseo-native-harness-"));
  const updates: Acp.SessionUpdate[] = [];
  const agent = () =>
    createPhaseoAcpAgent({
      stateDirectory: NodePath.join(root, "state"),
      globalInstructionsRoot: NodePath.join(root, "global", "instructions"),
      models,
      client: model,
    });
  const client = () =>
    Acp.client({ name: "fixture" })
      .onNotification("session/update", ({ params }) => {
        updates.push(params.update);
      })
      .onRequest("session/request_permission", ({ params }) => permission(params));
  let connection = client().connect(agent());
  const initialize = () =>
    connection.agent.request("initialize", {
      protocolVersion: Acp.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "fixture", version: "1" },
    });
  await initialize();
  const created = await connection.agent.request("session/new", { cwd: root, mcpServers: [] });
  return {
    root,
    updates,
    sessionId: created.sessionId,
    get rpc() {
      return connection.agent;
    },
    prompt: (text: string, id = created.sessionId) =>
      connection.agent.request("session/prompt", {
        sessionId: id,
        prompt: [{ type: "text", text }],
      }),
    reconnect: async () => {
      connection.close();
      connection = client().connect(agent());
      await initialize();
      await connection.agent.request("session/resume", {
        cwd: root,
        sessionId: created.sessionId,
        mcpServers: [],
      });
    },
    close: async () => {
      connection.close();
      await NodeFs.rm(root, { recursive: true, force: true });
    },
  };
};

describe("Phaseo native harness ACP boundary", () => {
  it("returns rejected command paths to the model without failing the turn", async () => {
    const requests: AgentModelRequest[] = [];
    const f = await fixture({
      generate: async () => {
        throw new Error("Expected streaming");
      },
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          yield {
            type: "response.completed",
            response: {
              message: {
                role: "assistant",
                content: "",
                toolCalls: [
                  {
                    id: "bad-command",
                    name: "run_project_command",
                    input: {
                      command: "echo should-not-run",
                      directory: NodePath.resolve(NodeOs.tmpdir()),
                    },
                  },
                ],
              },
            },
          };
        } else {
          const error = request.messages.find(
            (message) => message.role === "tool" && message.toolCallId === "bad-command",
          );
          expect(error?.content).toContain("Choose a path inside this project");
          yield { type: "response.output_text.delta", delta: "The command path was rejected." };
          yield {
            type: "response.completed",
            response: {
              message: {
                role: "assistant",
                content: "The command path was rejected.",
              },
            },
          };
        }
      },
    });
    try {
      expect((await f.prompt("Test command error recovery")).stopReason).toBe("end_turn");
      expect(requests).toHaveLength(2);
      expect(
        f.updates.some(
          (update) => update.sessionUpdate === "tool_call_update" && update.status === "failed",
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });

  it("streams thinking, executes the existing file tools, and ends with one final response in order", async () => {
    const requests: AgentModelRequest[] = [];
    const f = await fixture({
      generate: async () => {
        throw new Error("Expected streaming");
      },
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          yield { type: "response.reasoning.delta", delta: "Inspecting the project." };
          yield { type: "response.output_text.delta", delta: "I'll inspect the files.\n" };
          yield {
            type: "response.completed",
            response: {
              message: {
                role: "assistant",
                content: "I'll inspect the files.\n",
                toolCalls: [
                  { id: "read-1", name: "project_files", input: { action: "list", path: "." } },
                ],
              },
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          };
        } else {
          yield { type: "response.output_text.delta", delta: "Done." };
          yield {
            type: "response.completed",
            response: {
              message: { role: "assistant", content: "Done." },
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          };
        }
      },
    });
    try {
      await f.rpc.request("session/set_config_option", {
        sessionId: f.sessionId,
        configId: "model",
        value: "lab/second",
      });
      const result = await f.prompt("Inspect the files");
      expect(result.stopReason).toBe("end_turn");
      expect(result.usage?.totalTokens).toBe(10);
      expect(requests.every((request) => request.model === "lab/second")).toBe(true);
      expect(
        requests[1]!.messages.some(
          (message) => message.role === "tool" && message.name === "project_files",
        ),
      ).toBe(true);
      const text = f.updates
        .filter((update) => update.sessionUpdate === "agent_message_chunk")
        .map((update) =>
          "content" in update && update.content.type === "text" ? update.content.text : "",
        )
        .join("");
      expect(text).toBe("I'll inspect the files.\nDone.");
      const thought = f.updates.findIndex(
        (update) => update.sessionUpdate === "agent_thought_chunk",
      );
      const tool = f.updates.findIndex(
        (update) => update.sessionUpdate === "tool_call_update" && update.title === "Inspect files",
      );
      const final = f.updates.findIndex(
        (update) =>
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text" &&
          update.content.text === "Done.",
      );
      expect(thought).toBeGreaterThanOrEqual(0);
      expect(tool).toBeGreaterThan(thought);
      expect(final).toBeGreaterThan(tool);
    } finally {
      await f.close();
    }
  });

  it("does not execute declined edits and preserves structured approval details", async () => {
    let count = 0;
    const permission = vi.fn(
      async (_request: Acp.RequestPermissionRequest): Promise<Acp.RequestPermissionResponse> => ({
        outcome: { outcome: "selected", optionId: "reject" },
      }),
    );
    const f = await fixture(
      {
        generate: async () =>
          ++count === 1
            ? {
                message: {
                  role: "assistant",
                  content: "",
                  toolCalls: [
                    {
                      id: "edit-1",
                      name: "write_project_file",
                      input: { path: "declined.txt", content: "No", expectedHash: "new" },
                    },
                  ],
                },
              }
            : { message: { role: "assistant", content: "Edit declined." } },
      },
      permission,
    );
    try {
      expect((await f.prompt("Edit a file")).stopReason).toBe("end_turn");
      await expect(NodeFs.stat(NodePath.join(f.root, "declined.txt"))).rejects.toThrow();
      expect(permission.mock.calls[0]![0].toolCall.kind).toBe("edit");
      expect(permission.mock.calls[0]![0].toolCall.toolCallId).toContain(":edit-1");
    } finally {
      await f.close();
    }
  });

  it("restores conversation and SDK state after restarting, and forks history without mutating the parent", async () => {
    const requests: AgentModelRequest[] = [];
    const sessionIds: string[] = [];
    const f = await fixture((sessionId) => {
      sessionIds.push(sessionId);
      return {
        generate: async (request) => {
          requests.push(request);
          return { message: { role: "assistant", content: `Reply ${requests.length}` } };
        },
      };
    });
    try {
      await f.prompt("First");
      await f.reconnect();
      await f.prompt("Second");
      expect(
        requests[1]!.messages.some(
          (message) =>
            (message.role === "user" &&
              typeof message.content === "string" &&
              message.content === "First") ||
            (message.role === "user" &&
              Array.isArray(message.content) &&
              message.content.some((block) => block.type === "text" && block.text === "First")),
        ),
      ).toBe(true);
      const fork = await f.rpc.request("session/fork", {
        sessionId: f.sessionId,
        cwd: f.root,
        mcpServers: [],
      });
      await f.prompt("Branch", fork.sessionId);
      expect(sessionIds).toEqual([f.sessionId, f.sessionId, fork.sessionId]);
      expect(fork.sessionId).not.toBe(f.sessionId);
      const store = new HarnessSessionStore(NodePath.join(f.root, "state", "sessions"));
      const parent = await store.load(f.sessionId);
      expect(parent.messages.some((message) => JSON.stringify(message).includes("Branch"))).toBe(
        false,
      );
      expect(
        (await store.load(fork.sessionId)).messages.some((message) =>
          JSON.stringify(message).includes("First"),
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });

  it("cancels promptly while an approval response is pending", async () => {
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = await fixture(
      {
        generate: async () => ({
          message: {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "command-1",
                name: "run_project_command",
                input: { command: "Write-Output should-not-run" },
              },
            ],
          },
        }),
      },
      async () => {
        entered();
        return new Promise(() => {});
      },
    );
    try {
      const pending = f.prompt("Run a command");
      await waiting;
      await f.rpc.notify("session/cancel", { sessionId: f.sessionId });
      const result = await Promise.race([
        pending,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Cancellation stalled")), 1500),
        ),
      ]);
      expect(result.stopReason).toBe("cancelled");
    } finally {
      await f.close();
    }
  });

  it("routes delegation tools through scoped MCP credentials", async () => {
    let count = 0;
    const f = await fixture({
      generate: async (request) => {
        if (++count === 1) {
          const tool = request.tools.find((tool) => tool.description?.includes("spawn_thread"));
          if (!tool) throw new Error("T3 delegation tools were not connected.");
          return {
            message: {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "delegate-1", name: tool.id, input: { prompt: "Child task" } }],
            },
          };
        }
        return { message: { role: "assistant", content: "Delegated to the child chat." } };
      },
    });
    try {
      const script = NodePath.join(f.root, "mcp.cjs"),
        calls = NodePath.join(f.root, "calls.json");
      await NodeFs.writeFile(
        script,
        `const rl=require('node:readline'),fs=require('node:fs');rl.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'T3 fixture',version:'1'}};else if(r.method==='tools/list')result={tools:[{name:'spawn_thread',description:'Delegate a child chat',inputSchema:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}}]};else if(r.method==='tools/call'){fs.writeFileSync(process.argv[2],JSON.stringify({scope:process.env.T3_FIXTURE_SCOPE,args:r.params.arguments}));result={content:[{type:'text',text:'Created child-fixture'}]};}else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`,
      );
      const session = await f.rpc.request("session/new", {
        cwd: f.root,
        mcpServers: [
          {
            name: "T3 orchestration",
            command: process.execPath,
            args: [script, calls],
            env: [{ name: "T3_FIXTURE_SCOPE", value: "parent-owned" }],
          },
        ],
      });
      expect((await f.prompt("Delegate this work", session.sessionId)).stopReason).toBe("end_turn");
      expect(JSON.parse(await NodeFs.readFile(calls, "utf8"))).toEqual({
        scope: "parent-owned",
        args: { prompt: "Child task" },
      });
    } finally {
      await f.close();
    }
  });

  it("preserves multi-select and free-answer questions without turning them into approvals", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "phaseo-questions-"));
    let count = 0;
    const model: AgentModelClient = {
      generate: async () =>
        ++count === 1
          ? {
              message: {
                role: "assistant",
                content: "",
                toolCalls: [
                  {
                    id: "ask-1",
                    name: "ask_user",
                    input: {
                      questions: [
                        {
                          header: "Choices",
                          question: "Which choices?",
                          multiSelect: true,
                          options: [{ label: "A" }, { label: "B" }],
                        },
                      ],
                    },
                  },
                ],
              },
            }
          : { message: { role: "assistant", content: "Received your choices." } },
    };
    const question = vi.fn(
      async (request: {
        questions: { id: string; multiSelect: boolean; allowCustomAnswer: boolean }[];
      }) => {
        expect(request.questions[0]).toMatchObject({ multiSelect: true, allowCustomAnswer: true });
        return { [request.questions[0]!.id]: ["A", "A custom choice"] };
      },
    );
    const client = Acp.client({ name: "fixture" })
      .onNotification("session/update", () => {})
      .onRequest(
        "_phaseo/ask_user",
        { parse: (params: unknown) => params as Parameters<typeof question>[0] },
        (context) => question(context.params),
      )
      .onRequest("session/request_permission", () => {
        throw new Error("Questions must not be approvals.");
      });
    const connection = client.connect(
      createPhaseoAcpAgent({
        stateDirectory: NodePath.join(root, "state"),
        globalInstructionsRoot: NodePath.join(root, "global"),
        models,
        client: model,
      }),
    );
    try {
      await connection.agent.request("initialize", {
        protocolVersion: Acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "fixture", version: "1" },
      });
      const session = await connection.agent.request("session/new", { cwd: root, mcpServers: [] });
      const response = await connection.agent.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Ask me" }],
      });
      expect(response.stopReason).toBe("end_turn");
      expect(question).toHaveBeenCalledOnce();
    } finally {
      connection.close();
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });
});
