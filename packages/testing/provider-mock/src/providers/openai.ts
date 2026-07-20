import type { ProviderContract } from "../registry.js";
import type { MockRequest, MockResponse } from "../types.js";
import { ProviderMockServer } from "../server.js";

export type OpenAIMockOptions = {
  text?: string;
  embedding?: number[];
  imageUrl?: string;
  transcription?: string;
};

function inputText(body: any): string {
  if (typeof body?.input === "string") return body.input;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.map((message: any) => typeof message?.content === "string" ? message.content : "").join(" ");
}

function responsesPayload(request: MockRequest, text: string) {
  const body = request.body as any;
  const model = body?.model ?? "gpt-mock";
  const hasTools = Array.isArray(body?.tools) && body.tools.length > 0;
  return {
    id: `resp_${request.id}`,
    object: "response",
    created_at: 1,
    status: "completed",
    model,
    output: hasTools ? [{
      id: `fc_${request.id}`,
      type: "function_call",
      status: "completed",
      call_id: `call_${request.id}`,
      name: body.tools[0]?.name ?? body.tools[0]?.function?.name ?? "lookup_weather",
      arguments: JSON.stringify({ city: "London" }),
    }] : [{
      id: `msg_${request.id}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    }],
    usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
  };
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createResponse(request: MockRequest, text: string): MockResponse {
  const response = responsesPayload(request, text);
  if (!(request.body as any)?.stream) return { body: response };
  return {
    headers: { "content-type": "text/event-stream" },
    body: [
      sse("response.created", { type: "response.created", response: { ...response, status: "in_progress", output: [] } }),
      sse("response.output_text.delta", { type: "response.output_text.delta", delta: text }),
      sse("response.completed", { type: "response.completed", response }),
      "data: [DONE]\n\n",
    ].join(""),
  };
}

function createChatCompletion(request: MockRequest, text: string): MockResponse {
  const body = request.body as any;
  const base = { id: `chatcmpl_${request.id}`, object: "chat.completion", created: 1, model: body?.model ?? "gpt-mock" };
  const tool = Array.isArray(body?.tools) ? body.tools[0] : undefined;
  const toolCall = tool ? [{ id: `call_${request.id}`, type: "function", function: { name: tool.function?.name ?? tool.name ?? "lookup_weather", arguments: JSON.stringify({ city: "London" }) } }] : undefined;
  if (!body?.stream) {
    return { body: { ...base, choices: [{ index: 0, message: { role: "assistant", content: toolCall ? null : text, ...(toolCall ? { tool_calls: toolCall } : {}) }, finish_reason: toolCall ? "tool_calls" : "stop" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } } };
  }
  const frames = toolCall ? [
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", tool_calls: toolCall.map((call, index) => ({ ...call, index })) }, finish_reason: null }] },
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } },
  ] : [
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] },
    { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } },
  ];
  return { headers: { "content-type": "text/event-stream" }, body: `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n` };
}

export function openAIResponders(options: OpenAIMockOptions = {}) {
  const text = options.text ?? "Hello from the Phaseo OpenAI contract mock.";
  const embedding = options.embedding ?? [0.11, 0.22, 0.33, 0.44];
  const imageUrl = options.imageUrl ?? "https://example.com/phaseo-openai-mock.png";
  const transcription = options.transcription ?? "Deterministic OpenAI transcription.";
  const videoPolls = new Map<string, number>();
  const batchPolls = new Map<string, number>();
  return {
    createResponse: (request: MockRequest) => createResponse(request, text),
    createChatCompletion: (request: MockRequest) => createChatCompletion(request, text),
    createEmbedding: (request: MockRequest) => ({ body: { object: "list", model: (request.body as any)?.model, data: [{ object: "embedding", index: 0, embedding }], usage: { prompt_tokens: 4, total_tokens: 4 } } }),
    createModeration: (request: MockRequest) => ({ body: { id: `modr_${request.id}`, model: (request.body as any)?.model ?? "omni-moderation-latest", results: [{ flagged: inputText(request.body).includes("[flagged]"), categories: { violence: inputText(request.body).includes("[flagged]") }, category_scores: { violence: inputText(request.body).includes("[flagged]") ? 0.99 : 0.01 } }] } }),
    createImage: () => ({ body: { created: 1, data: [{ url: imageUrl, revised_prompt: "Deterministic OpenAI image" }] } }),
    createImageEdit: () => ({ body: { created: 1, data: [{ url: imageUrl, revised_prompt: "Deterministic OpenAI image edit" }] } }),
    createSpeech: () => ({ headers: { "content-type": "audio/mpeg" }, body: Buffer.from("PHASEO_OPENAI_MOCK_AUDIO") }),
    createTranscription: () => ({ body: { text: transcription, language: "english", duration: 1.25, segments: [] } }),
    createTranslation: () => ({ body: { text: transcription } }),
    createVideo: (request: MockRequest) => {
      const id = `video_${request.id}`;
      videoPolls.set(id, 0);
      return { body: { id, object: "video", model: (request.body as any)?.model ?? "sora-2", status: "queued", progress: 0, created_at: 1, size: "1024x1792", seconds: "8", quality: "standard" } };
    },
    GetVideo: (request: MockRequest) => {
      const id = request.path.split("/").at(-1)!;
      const polls = (videoPolls.get(id) ?? 0) + 1;
      videoPolls.set(id, polls);
      const completed = polls >= 2;
      return { body: { id, object: "video", model: "sora-2", status: completed ? "completed" : "in_progress", progress: completed ? 100 : 50, created_at: 1 } };
    },
    RetrieveVideoContent: () => ({ headers: { "content-type": "video/mp4" }, body: Buffer.from("PHASEO_OPENAI_MOCK_VIDEO") }),
    DeleteVideo: (request: MockRequest) => ({ body: { id: request.path.split("/").at(-1), object: "video.deleted", deleted: true } }),
    createBatch: (request: MockRequest) => {
      const id = `batch_${request.id}`;
      batchPolls.set(id, 0);
      return {
        body: {
          id,
          object: "batch",
          endpoint: (request.body as any)?.endpoint ?? "/v1/responses",
          status: "validating",
          created_at: 1,
          input_file_id: (request.body as any)?.input_file_id,
          completion_window: "24h",
          request_counts: { total: 0, completed: 0, failed: 0 },
        },
      };
    },
    retrieveBatch: (request: MockRequest) => {
      const id = request.path.split("/").at(-1)!;
      const polls = (batchPolls.get(id) ?? 0) + 1;
      batchPolls.set(id, polls);
      const completed = polls >= 2;
      return {
        body: {
          id,
          object: "batch",
          endpoint: "/v1/responses",
          status: completed ? "completed" : "in_progress",
          created_at: 1,
          completion_window: "24h",
          request_counts: { total: 1, completed: completed ? 1 : 0, failed: 0 },
        },
      };
    },
    cancelBatch: (request: MockRequest) => ({ body: { id: request.path.split("/").at(-2), object: "batch", endpoint: "/v1/responses", status: "cancelling", created_at: 1, completion_window: "24h", request_counts: { total: 1, completed: 0, failed: 0 } } }),
  } satisfies Record<string, (request: MockRequest) => MockResponse>;
}

export function registerOpenAIProvider(server: ProviderMockServer, contract: ProviderContract, options: OpenAIMockOptions = {}): ProviderMockServer {
  if (contract.manifest.providerId !== "openai") throw new Error("registerOpenAIProvider requires the OpenAI contract");
  return server.registerOpenApi("openai", contract.document, { basePath: "/v1", strict: true, responses: openAIResponders(options) });
}

export function registerXAIProvider(server: ProviderMockServer, contract: ProviderContract, options: OpenAIMockOptions = {}): ProviderMockServer {
  if (contract.manifest.providerId !== "x-ai") throw new Error("registerXAIProvider requires the xAI contract");
  return server.registerOpenApi("x-ai", contract.document, { basePath: "/v1", strict: true, responses: openAIResponders(options) });
}
