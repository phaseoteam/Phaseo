import type { ProviderContract } from "../registry.js";
import { ProviderMockServer } from "../server.js";
import type { MockRequest, MockResponse } from "../types.js";

function createMessage(request: MockRequest): MockResponse {
  const body = request.body as any;
  const tool = Array.isArray(body?.tools) ? body.tools[0] : undefined;
  const content = tool
    ? [{ type: "tool_use", id: `toolu_${request.id}`, name: tool.name, input: { city: "London" } }]
    : [{ type: "text", text: "Hello from the Phaseo Anthropic contract mock." }];
  const message = {
      id: `msg_${request.id}`,
      type: "message",
      role: "assistant",
      model: body?.model ?? "claude-mock",
      content,
      stop_reason: tool ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 4, output_tokens: 3 },
  };
  if (!body?.stream) return { body: message };
  const block = content[0];
  const events = [
    { type: "message_start", message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 4, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: tool ? { type: "tool_use", id: (block as any).id, name: tool.name, input: {} } : { type: "text", text: "" } },
    tool
      ? { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ city: "London" }) } }
      : { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: (block as any).text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 3 } },
    { type: "message_stop" },
  ];
  return {
    headers: { "content-type": "text/event-stream" },
    body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
  };
}

export function registerAnthropicProvider(server: ProviderMockServer, contract: ProviderContract): ProviderMockServer {
  if (contract.manifest.providerId !== "anthropic") throw new Error("registerAnthropicProvider requires the Anthropic contract");
  return server.registerOpenApi("anthropic", contract.document, {
    basePath: "/v1",
    strict: true,
    responses: { createMessage },
  });
}
