export type SdkRequest = { endpoint: string; body: Record<string, unknown>; baseUrl?: string; requestId?: string; status?: number };
export type SdkSample = "sdk-typescript" | "sdk-python" | "agent-typescript" | "agent-python";

const endpoints: Record<string, string> = {
  text: "/responses", playground: "/responses", "chat-completions": "/chat/completions", messages: "/messages",
  image: "/images/generations", video: "/videos", embeddings: "/embeddings", moderation: "/moderations",
  decisions: "/decisions", ocr: "/ocr", rerank: "/rerank",
};
const audio: Record<string, string> = { speech: "/audio/speech", transcription: "/audio/transcriptions", translation: "/audio/translations", music: "/music/generate" };
const methods: Record<string, [string, string]> = {
  "/responses": ["responses.create", "responses.create"], "/chat/completions": ["chat.completions.create", "chat.completions.create"],
  "/messages": ["messages.create", "messages.create"], "/images/generations": ["generateImage", "images.generate"],
  "/videos": ["videos.generateAndWait", "videos.generate_and_wait"], "/music/generate": ["music.generateAndWait", "music.generate_and_wait"],
  "/embeddings": ["generateEmbedding", "embeddings.create"], "/moderations": ["generateModeration", "moderations.create"],
  "/decisions": ["decisions.make", "decisions.make"], "/ocr": ["ocr.create", "ocr.create"], "/rerank": ["rerank.create", "rerank.create"],
  "/audio/speech": ["generateSpeech", "audio.speech.create"], "/audio/transcriptions": ["generateTranscription", "audio.transcriptions.create"],
  "/audio/translations": ["generateTranslation", "audio.translations.create"],
};

export function sdkRequestFromChat(path: string, init: RequestInit): SdkRequest | null {
  if (init.method?.toUpperCase() !== "POST" || typeof init.body !== "string") return null;
  const room = path.replace("/api/chat/", "");
  try {
    const wrapper = JSON.parse(init.body);
    if (room === "realtime/session") {
      const provider = normalizeRealtimeProvider(wrapper.provider);
      const model = normalizeRealtimeModel(provider, wrapper.model);
      if (!model) return null;
      return {
        endpoint: "/audio/realtime/sessions",
        body: redactCredentials({
          model,
          ...(provider ? { provider } : {}),
          ...(typeof wrapper.voice === "string" && wrapper.voice.trim() ? { voice: wrapper.voice.trim() } : {}),
          ...(typeof wrapper.instructions === "string" && wrapper.instructions.trim() ? { instructions: wrapper.instructions.trim() } : {}),
          ...(["low", "medium", "high"].includes(wrapper.thinkingLevel) ? { thinking_level: wrapper.thinkingLevel } : {}),
        }) as Record<string, unknown>,
      };
    }
    const endpoint = room === "audio" ? audio[wrapper.action] : endpoints[room];
    if (!endpoint || !wrapper.requestBody || typeof wrapper.requestBody !== "object" || Array.isArray(wrapper.requestBody)) return null;
    return { endpoint, body: redactCredentials(wrapper.requestBody) as Record<string, unknown>, ...(typeof wrapper.baseUrl === "string" ? { baseUrl: wrapper.baseUrl } : {}) };
  } catch { return null; }
}

function normalizeRealtimeProvider(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const provider = value.trim().toLowerCase();
  if (provider === "xai" || provider === "x-ai") return "spacex-ai";
  if (provider === "google") return "google-ai-studio";
  return ["openai", "spacex-ai", "google-ai-studio"].includes(provider) ? provider : null;
}

function normalizeRealtimeModel(provider: string | null, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const model = value.trim();
  if (model.includes("/")) return provider === "spacex-ai" ? model.replace(/^(xai|x-ai)\//, "spacex-ai/") : model;
  if (provider === "openai") return `openai/${model}`;
  if (provider === "spacex-ai") return `spacex-ai/${model}`;
  if (provider === "google-ai-studio") return `google/${model}`;
  return model;
}

function redactCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCredentials);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^(api_?key|authorization|access_token|client_secret)$/i.test(key) ? "REPLACE_WITH_YOUR_CREDENTIAL" : redactCredentials(item),
  ]));
  return value;
}

function pythonLiteral(value: unknown, depth = 1): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  const indent = "    ".repeat(depth);
  if (Array.isArray(value)) return value.length ? `[\n${value.map(item => `${indent}    ${pythonLiteral(item, depth + 1)}`).join(",\n")}\n${indent}]` : "[]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? `{\n${entries.map(([key, item]) => `${indent}    ${JSON.stringify(key)}: ${pythonLiteral(item, depth + 1)}`).join(",\n")}\n${indent}}` : "{}";
  }
  return JSON.stringify(value);
}

const agentClientOptionKeys: Record<string, string> = {
  provider: "provider",
  reasoning: "reasoning",
  metadata: "metadata",
  response_format: "responseFormat",
  meta: "includeMeta",
  web_search_options: "webSearchOptions",
  plugins: "plugins",
  provider_options: "providerOptions",
  prompt_cache_key: "promptCacheKey",
};

const agentOwnedRequestKeys = new Set([
  "model", "input", "instructions", "tools", "stream", "temperature", "max_output_tokens", "top_p",
  ...Object.keys(agentClientOptionKeys),
]);

export function agentSdkSupportReason(request: SdkRequest): string | null {
  if (request.endpoint !== "/responses") return "Available for Responses requests";
  if (request.body.input === undefined) return "Add an input to use the Agent SDK";
  if (Array.isArray(request.body.tools) && request.body.tools.length > 0) return "Remove request tools to create an agent starter";
  return normalizeAgentInput(request.body.input).reason;
}

type NormalizedAgentInput = { input?: string; instructions?: string; reason: string | null };

function responseMessageText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return null;
    const record = part as Record<string, unknown>;
    return record.type === "input_text" && typeof record.text === "string" ? record.text : null;
  });
  return text.every((part): part is string => part !== null) ? text.join("\n") : null;
}

function normalizeAgentInput(value: unknown): NormalizedAgentInput {
  if (typeof value === "string") return { input: value, reason: null };
  if (!Array.isArray(value)) return { reason: "Use text input to create an agent starter" };

  const instructions: string[] = [];
  const userInputs: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { reason: "Use text-only messages to create an agent starter" };
    }
    const message = item as Record<string, unknown>;
    const content = responseMessageText(message.content);
    if (content === null) return { reason: "Use text-only messages to create an agent starter" };
    if (message.role === "system" || message.role === "developer") instructions.push(content);
    else if (message.role === "user") userInputs.push(content);
    else return { reason: "Start a new turn to create an agent starter" };
  }
  if (userInputs.length !== 1) return { reason: "Start with one user message to create an agent starter" };
  return {
    input: userInputs[0],
    ...(instructions.length > 0 ? { instructions: instructions.join("\n\n") } : {}),
    reason: null,
  };
}

function indent(value: string, spaces: number) {
  const padding = " ".repeat(spaces);
  return value.replace(/\n/g, `\n${padding}`);
}

function typescriptProperty(name: string, value: unknown, spaces = 2) {
  return `${" ".repeat(spaces)}${name}: ${indent(JSON.stringify(value, null, 2), spaces)},`;
}

function agentCode(request: SdkRequest, language: "typescript" | "python"): string {
  const supportReason = agentSdkSupportReason(request);
  if (supportReason) throw new Error(supportReason);

  const body = request.body;
  const model = typeof body.model === "string" ? body.model : "phaseo/free";
  const normalizedInput = normalizeAgentInput(body.input);
  const input = normalizedInput.input!;
  const definitionEntries: Array<[string, unknown]> = [["model", model]];
  const instructions = [
    typeof body.instructions === "string" && body.instructions.trim() ? body.instructions : null,
    normalizedInput.instructions,
  ].filter((value): value is string => Boolean(value)).join("\n\n");
  if (instructions) definitionEntries.push(["instructions", instructions]);
  if (typeof body.temperature === "number") definitionEntries.push(["temperature", body.temperature]);
  if (typeof body.max_output_tokens === "number") definitionEntries.push(["maxOutputTokens", body.max_output_tokens]);
  if (typeof body.top_p === "number") definitionEntries.push(["topP", body.top_p]);

  const clientEntries = Object.entries(agentClientOptionKeys)
    .filter(([source]) => body[source] !== undefined)
    .map(([source, target]) => [target, body[source]] as [string, unknown]);
  const requestOptions = Object.fromEntries(Object.entries(body).filter(([key]) => !agentOwnedRequestKeys.has(key)));
  if (Object.keys(requestOptions).length > 0) clientEntries.push(["requestOptions", requestOptions]);

  if (language === "typescript") {
    const definition = definitionEntries.map(([key, value]) => typescriptProperty(key, value)).join("\n");
    const clientOptions = [
      "  clientOptions: {",
      "    apiKey: process.env.PHASEO_API_KEY!,",
      ...(request.baseUrl ? [typescriptProperty("baseUrl", request.baseUrl, 4)] : []),
      "  },",
      ...clientEntries.map(([key, value]) => typescriptProperty(key, value)),
    ].join("\n");
    return `// npm install @phaseo/sdk @phaseo/agent-sdk\n// Set PHASEO_API_KEY in your server environment.\nimport { createAgent, createGatewayAgentClient } from "@phaseo/agent-sdk";\n\nconst agent = createAgent({\n  id: "request-agent",\n${definition}\n});\n\nconst client = createGatewayAgentClient({\n${clientOptions}\n});\n\nconst result = await agent.run({\n  input: ${indent(JSON.stringify(input, null, 2), 2)},\n  client,\n});\n\nconsole.log(result.output);\n`;
  }

  const pythonDefinitions: Array<[string, unknown]> = definitionEntries.map(([key, value]) => [
    key === "maxOutputTokens" ? "max_output_tokens" : key === "topP" ? "top_p" : key,
    value,
  ]);
  const pythonClientEntries: Array<[string, unknown]> = clientEntries.map(([key, value]) => [
    ({ responseFormat: "response_format", includeMeta: "include_meta", webSearchOptions: "web_search_options", providerOptions: "provider_options", promptCacheKey: "prompt_cache_key", requestOptions: "request_options" } as Record<string, string>)[key] ?? key,
    value,
  ]);
  const definition = pythonDefinitions.map(([key, value]) => `    ${JSON.stringify(key)}: ${pythonLiteral(value, 1)},`).join("\n");
  const clientOptions = [
    "    client_options={",
    '        "api_key": os.environ["PHASEO_API_KEY"],',
    ...(request.baseUrl ? [`        "base_url": ${JSON.stringify(request.baseUrl)},`] : []),
    "    },",
    ...pythonClientEntries.map(([key, value]) => `    ${key}=${pythonLiteral(value, 1)},`),
  ].join("\n");
  return `# pip install phaseo phaseo-agent-sdk\n# Set PHASEO_API_KEY in your server environment.\nimport os\n\nfrom phaseo_agent import create_agent, create_gateway_agent_client\n\nagent = create_agent({\n    "id": "request-agent",\n${definition}\n})\n\nclient = create_gateway_agent_client(\n${clientOptions}\n)\n\nresult = agent.run(\n    input=${pythonLiteral(input, 1)},\n    client=client,\n)\n\nprint(result.output)\n`;
}

export function sdkCode(request: SdkRequest, sample: SdkSample | "typescript" | "python"): string {
  if (sample === "agent-typescript") return agentCode(request, "typescript");
  if (sample === "agent-python") return agentCode(request, "python");
  const language = sample === "sdk-python" ? "python" : sample === "sdk-typescript" ? "typescript" : sample;
  const method = methods[request.endpoint];
  const genericRequest = request.endpoint === "/audio/realtime/sessions";
  if (!method && !genericRequest) throw new Error("This endpoint has no SDK export");
  const body = JSON.stringify(request.body, null, 2);
  const streaming = request.body.stream === true && ["/responses", "/chat/completions", "/messages"].includes(request.endpoint);
  if (language === "typescript") {
    const config = request.baseUrl ? `, baseUrl: ${JSON.stringify(request.baseUrl)}` : "";
    const streamMethod = { "/responses": "streamResponses", "/chat/completions": "streamChat", "/messages": "streamMessages" }[request.endpoint];
    const call = streaming ? `for await (const event of client.${streamMethod}(${body})) {\n  process.stdout.write(event.text ?? "");\n}`
      : genericRequest ? `const result = await client.request("POST", ${JSON.stringify(request.endpoint)}, { body: ${body} });\nconsole.log(result);`
      : `const result = await client.${method[0]}(${body});\n${request.endpoint === "/audio/speech" ? 'await writeFile("speech.mp3", new Uint8Array(await result.arrayBuffer()));' : "console.log(result);"}`;
    return `// npm install @phaseo/sdk\n// Set PHASEO_API_KEY in your server environment.\nimport { Phaseo } from "@phaseo/sdk";\n${request.endpoint === "/audio/speech" ? 'import { writeFile } from "node:fs/promises";\n' : ""}\nconst client = new Phaseo({ apiKey: process.env.PHASEO_API_KEY${config} });\n\n${call}\n`;
  }
  const config = request.baseUrl ? `base_url=${JSON.stringify(request.baseUrl)}` : "";
  const call = streaming ? `async for event in client.${method[1].replace(/\.create$/, ".stream")}(request):\n            print(event.get("text", ""), end="", flush=True)`
    : genericRequest ? `result = await client.request("POST", ${JSON.stringify(request.endpoint)}, body=request)\n        print(result)`
    : `result = await client.${method[1]}(request)\n        ${request.endpoint === "/audio/speech" ? 'Path("speech.mp3").write_bytes(result)' : "print(result)"}`;
  return `# pip install phaseo\n# Set PHASEO_API_KEY in your server environment.\nimport asyncio\n${request.endpoint === "/audio/speech" ? "from pathlib import Path\n" : ""}from phaseo import AsyncPhaseo\n\nasync def main():\n    request = ${pythonLiteral(request.body)}\n    async with AsyncPhaseo(${config}) as client:\n        ${call}\n\nasyncio.run(main())\n`;
}

let lastRequest: SdkRequest | null = null;
const subscribers = new Set<() => void>();
export const sdkExportStore = {
  get: () => lastRequest,
  subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
  set(request: SdkRequest | null) { lastRequest = request; subscribers.forEach(listener => listener()); },
};
