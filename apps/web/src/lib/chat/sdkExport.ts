export type SdkRequest = { endpoint: string; body: Record<string, unknown>; baseUrl?: string; requestId?: string; status?: number };
export type SdkLanguage = "typescript" | "python" | "go" | "csharp" | "java" | "php" | "ruby" | "cpp" | "rust";
export type AgentLanguage = Exclude<SdkLanguage, "cpp">;
export type SdkSample = "curl" | `sdk-${SdkLanguage}` | `agent-${AgentLanguage}`;
export type TextProtocol = "responses" | "chat-completions" | "messages";

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
const cppOperations: Record<string, string> = {
  "/responses": "CreateResponse", "/chat/completions": "CreateChatCompletion", "/messages": "CreateAnthropicMessage",
  "/images/generations": "CreateImage", "/videos": "CreateVideo", "/music/generate": "GenerateMusic",
  "/embeddings": "CreateEmbedding", "/moderations": "CreateModeration", "/decisions": "MakeDecision",
  "/ocr": "CreateOcr", "/rerank": "CreateRerank", "/audio/speech": "CreateSpeech",
  "/audio/transcriptions": "CreateTranscription", "/audio/translations": "CreateTranslation",
  "/audio/realtime/sessions": "CreateRealtimeSession",
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
      return { endpoint: "/audio/realtime/sessions", body: redactCredentials({
        model, ...(provider ? { provider } : {}),
        ...(typeof wrapper.voice === "string" && wrapper.voice.trim() ? { voice: wrapper.voice.trim() } : {}),
        ...(typeof wrapper.instructions === "string" && wrapper.instructions.trim() ? { instructions: wrapper.instructions.trim() } : {}),
        ...(["low", "medium", "high"].includes(wrapper.thinkingLevel) ? { thinking_level: wrapper.thinkingLevel } : {}),
      }) as Record<string, unknown> };
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
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^session_?id$/i.test(key))
    .map(([key, item]) => [key,
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

type ConversationMessage = { role: "system" | "developer" | "user" | "assistant"; text: string };

export function textProtocolForRequest(request: SdkRequest): TextProtocol | null {
  if (request.endpoint === "/responses") return "responses";
  if (request.endpoint === "/chat/completions") return "chat-completions";
  if (request.endpoint === "/messages") return "messages";
  return null;
}

function messageText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return null;
    const record = part as Record<string, unknown>;
    return ["text", "input_text", "output_text"].includes(String(record.type)) && typeof record.text === "string" ? record.text : null;
  });
  return text.every((part): part is string => part !== null) ? text.join("\n") : null;
}

function normalizeConversation(request: SdkRequest, allowTools = false) {
  if (!textProtocolForRequest(request)) return { messages: [] as ConversationMessage[], reason: "Available for text requests" };
  if (!allowTools && Array.isArray(request.body.tools) && request.body.tools.length > 0) return { messages: [] as ConversationMessage[], reason: "Protocol switching requires a request without tools" };
  const messages: ConversationMessage[] = [];
  if (typeof request.body.instructions === "string" && request.body.instructions.trim()) messages.push({ role: "system", text: request.body.instructions });
  if (typeof request.body.system === "string" && request.body.system.trim()) messages.push({ role: "system", text: request.body.system });
  const source = request.endpoint === "/responses" ? request.body.input : request.body.messages;
  if (typeof source === "string") messages.push({ role: "user", text: source });
  else if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return { messages: [], reason: "Protocol switching requires text-only messages" };
      const record = item as Record<string, unknown>;
      if (!["system", "developer", "user", "assistant"].includes(String(record.role))) return { messages: [], reason: "Protocol switching requires standard text roles" };
      const text = messageText(record.content);
      if (text === null) return { messages: [], reason: "Protocol switching requires text-only messages" };
      messages.push({ role: record.role as ConversationMessage["role"], text });
    }
  } else return { messages: [], reason: "Add text input to switch protocols" };
  return { messages, reason: null };
}

const sharedTextKeys = ["model", "temperature", "top_p", "top_k", "stream", "provider", "provider_options", "reasoning", "metadata", "meta", "service_tier", "session_id", "prompt_cache_key", "web_search_options", "plugins"];
const openAiControlKeys = ["presence_penalty", "frequency_penalty", "seed", "logit_bias", "logprobs", "top_logprobs", "user", "n", "response_format", "stream_options"];

export function protocolSwitchSupportReason(request: SdkRequest, protocol?: TextProtocol): string | null {
  const conversationReason = normalizeConversation(request).reason;
  if (conversationReason || !protocol || protocol === textProtocolForRequest(request)) return conversationReason;
  if (protocol === "messages") {
    const unsupported = openAiControlKeys.filter(key => request.body[key] !== undefined);
    if (unsupported.length) return `Messages cannot preserve ${unsupported.join(", ")}`;
  }
  return null;
}

export function convertTextProtocol(request: SdkRequest, protocol: TextProtocol): SdkRequest {
  const current = textProtocolForRequest(request);
  if (!current) throw new Error("Available for text requests");
  if (current === protocol) return request;
  const conversation = normalizeConversation(request);
  if (conversation.reason) throw new Error(conversation.reason);
  const body: Record<string, unknown> = {};
  for (const key of [...sharedTextKeys, ...openAiControlKeys]) if (request.body[key] !== undefined) body[key] = request.body[key];
  if (protocol === "messages") {
    delete body.stop;
    if (request.body.stop !== undefined) body.stop_sequences = request.body.stop;
  } else {
    if (request.body.stop !== undefined) body.stop = request.body.stop;
    else if (request.body.stop_sequences !== undefined) body.stop = request.body.stop_sequences;
  }
  const tokenLimit = request.body.max_output_tokens ?? request.body.max_completion_tokens ?? request.body.max_tokens;
  const instructions = conversation.messages.filter(message => message.role === "system" || message.role === "developer").map(message => message.text).join("\n\n");
  const turns = conversation.messages.filter(message => message.role === "user" || message.role === "assistant");
  if (protocol === "responses") {
    if (instructions) body.instructions = instructions;
    body.input = turns.length === 1 && turns[0].role === "user" ? turns[0].text : turns.map(message => ({ role: message.role, content: message.text }));
    if (tokenLimit !== undefined) body.max_output_tokens = tokenLimit;
  } else if (protocol === "chat-completions") {
    body.messages = [...(instructions ? [{ role: "system", content: instructions }] : []), ...turns.map(message => ({ role: message.role, content: message.text }))];
    if (tokenLimit !== undefined) body.max_completion_tokens = tokenLimit;
  } else {
    if (instructions) body.system = instructions;
    body.messages = turns.map(message => ({ role: message.role, content: message.text }));
    body.max_tokens = tokenLimit ?? 1024;
  }
  return { ...request, endpoint: protocol === "responses" ? "/responses" : protocol === "chat-completions" ? "/chat/completions" : "/messages", body };
}

function normalizeAgentInput(request: SdkRequest): { input?: string; instructions?: string; omitsHistory?: boolean; reason: string | null } {
  const conversation = normalizeConversation(request, true);
  if (conversation.reason?.includes("text-only")) return { reason: "Use text-only messages to create an agent starter" };
  if (conversation.reason) return { reason: conversation.reason.replace("Protocol switching", "Agent samples") };
  const instructions = conversation.messages.filter(message => message.role === "system" || message.role === "developer").map(message => message.text);
  const turns = conversation.messages.filter(message => message.role === "user" || message.role === "assistant");
  const latestUserIndex = turns.findLastIndex(message => message.role === "user");
  if (latestUserIndex < 0) return { reason: "Add a user message to create an agent starter" };
  return {
    input: turns[latestUserIndex].text,
    ...(instructions.length ? { instructions: instructions.join("\n\n") } : {}),
    ...(turns.length > 1 ? { omitsHistory: true } : {}),
    reason: null,
  };
}

export function agentSdkSupportReason(request: SdkRequest): string | null {
  if (!textProtocolForRequest(request)) return "Available for text requests";
  if (managedGatewayTools(request) === null) return "Define function tool handlers to create an agent starter";
  if ((request.endpoint === "/responses" ? request.body.input : request.body.messages) === undefined) return "Add an input to use the Agent SDK";
  return normalizeAgentInput(request).reason;
}

function managedGatewayTools(request: SdkRequest): Array<Record<string, unknown>> | null {
  if (!Array.isArray(request.body.tools)) return [];
  const tools = request.body.tools.filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === "object");
  if (tools.some(tool => tool.type === "function"
    || ("function" in tool && typeof tool.function === "object")
    || (typeof tool.name === "string" && "input_schema" in tool))) return null;
  return tools;
}

function indent(value: string, spaces: number) { return value.replace(/\n/g, `\n${" ".repeat(spaces)}`); }
function singleQuotedLiteral(value: string) { return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function posixShellLiteral(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'`; }
function rustRawLiteral(value: string) {
  let hashes = "#";
  while (value.includes(`"${hashes}`)) hashes += "#";
  return `r${hashes}"${value}"${hashes}`;
}
function cppRawLiteral(value: string) {
  let delimiter = "phaseo";
  while (value.includes(`)${delimiter}\"`)) delimiter += "_";
  return `R\"${delimiter}(${value})${delimiter}\"`;
}

function agentCodeWithoutHistoryNote(request: SdkRequest, language: AgentLanguage): string {
  const reason = agentSdkSupportReason(request);
  if (reason) throw new Error(reason);
  const normalized = normalizeAgentInput(request);
  const model = typeof request.body.model === "string" ? request.body.model : "phaseo/free";
  const input = normalized.input!;
  const instructions = normalized.instructions;
  const gatewayTools = managedGatewayTools(request) ?? [];
  const optionKeys = new Set(["provider", "reasoning", "metadata", "response_format", "meta", "web_search_options", "plugins", "provider_options", "prompt_cache_key"]);
  const requestOptions = Object.fromEntries(Object.entries(request.body).filter(([key]) => !new Set(["model", "input", "messages", "system", "instructions", "tools", "stream", "temperature", "max_output_tokens", "max_completion_tokens", "max_tokens", "top_p", ...optionKeys]).has(key)));
  if (language === "typescript") {
    const clientOptions = [
      ...Object.entries(request.body).filter(([key]) => optionKeys.has(key)).map(([key, value]) => `  ${key === "meta" ? "includeMeta" : key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}: ${indent(JSON.stringify(value, null, 2), 2)},`),
      ...(gatewayTools.length ? [`  gatewayTools: ${indent(JSON.stringify(gatewayTools, null, 2), 2)},`] : []),
      ...(Object.keys(requestOptions).length ? [`  requestOptions: ${indent(JSON.stringify(requestOptions, null, 2), 2)},`] : []),
    ].join("\n");
    return `// npm install @phaseo/sdk @phaseo/agent-sdk\nimport { createAgent, createGatewayAgentClient } from "@phaseo/agent-sdk";\n\nconst agent = createAgent({\n  id: "request-agent",\n  model: ${JSON.stringify(model)},${instructions ? `\n  instructions: ${JSON.stringify(instructions)},` : ""}${typeof request.body.temperature === "number" ? `\n  temperature: ${request.body.temperature},` : ""}${typeof request.body.max_output_tokens === "number" ? `\n  maxOutputTokens: ${request.body.max_output_tokens},` : ""}${typeof request.body.top_p === "number" ? `\n  topP: ${request.body.top_p},` : ""}\n});\nconst client = createGatewayAgentClient({\n  clientOptions: { apiKey: process.env.PHASEO_API_KEY!${request.baseUrl ? `, baseUrl: ${JSON.stringify(request.baseUrl)}` : ""} },\n${clientOptions}\n});\nconst result = await agent.run({ input: ${JSON.stringify(input)}, client });\nconsole.log(result.output);\n`;
  }
  if (language === "python") {
    const clientOptions = [
      ...Object.entries(request.body).filter(([key]) => optionKeys.has(key)).map(([key, value]) => `    ${key === "meta" ? "include_meta" : key}=${pythonLiteral(value, 1)},`),
      ...(gatewayTools.length ? [`    gateway_tools=${pythonLiteral(gatewayTools, 1)},`] : []),
      ...(Object.keys(requestOptions).length ? [`    request_options=${pythonLiteral(requestOptions, 1)},`] : []),
    ].join("\n");
    return `# pip install phaseo phaseo-agent-sdk\nimport os\nfrom phaseo_agent import create_agent, create_gateway_agent_client\n\nagent = create_agent({\n    "id": "request-agent",\n    "model": ${JSON.stringify(model)},${instructions ? `\n    "instructions": ${JSON.stringify(instructions)},` : ""}${typeof request.body.temperature === "number" ? `\n    "temperature": ${request.body.temperature},` : ""}${typeof request.body.max_output_tokens === "number" ? `\n    "max_output_tokens": ${request.body.max_output_tokens},` : ""}${typeof request.body.top_p === "number" ? `\n    "top_p": ${request.body.top_p},` : ""}\n})\nclient = create_gateway_agent_client(\n    client_options={\n        "api_key": os.environ["PHASEO_API_KEY"],\n        "base_url": ${JSON.stringify(request.baseUrl ?? "https://api.phaseo.app/v1")},\n    },\n${clientOptions}\n)\nresult = agent.run(input=${JSON.stringify(input)}, client=client)\nprint(result.output)\n`;
  }
  if (language === "go") return `// go get github.com/phaseoteam/Phaseo/packages/sdk/agent-sdk-go@latest\npackage main\n\nimport (\n  "context"\n${gatewayTools.length ? '  "encoding/json"\n' : ""}  "fmt"\n  agent "github.com/phaseoteam/Phaseo/packages/sdk/agent-sdk-go"\n)\n\nfunc main() {\n  runner := agent.CreateAgent(agent.AgentDefinition{ID: "request-agent", Model: ${JSON.stringify(model)}${instructions ? `, Instructions: ${JSON.stringify(instructions)}` : ""}})\n${gatewayTools.length ? `  var gatewayTools []map[string]any\n  if err := json.Unmarshal([]byte(${JSON.stringify(JSON.stringify(gatewayTools))}), &gatewayTools); err != nil { panic(err) }\n` : ""}  client, err := agent.CreateGatewayAgentClient(agent.GatewayAgentClientOptions{${[request.baseUrl ? `BaseURL: ${JSON.stringify(request.baseUrl)}` : "", gatewayTools.length ? "GatewayTools: gatewayTools" : ""].filter(Boolean).join(", ")}})\n  if err != nil { panic(err) }\n  result, err := runner.Run(context.Background(), agent.RunOptions{Input: ${JSON.stringify(input)}, Client: client})\n  if err != nil { panic(err) }\n  fmt.Println(result.Output)\n}\n`;
  if (language === "csharp") return `// dotnet add package Phaseo.Sdk\n// dotnet add package Phaseo.AgentSdk\nusing System.Collections.Generic;\n${gatewayTools.length ? "using System.Text.Json;\n" : ""}using PhaseoAgentSdk;\n\nvar agent = AgentSdk.CreateAgent(new AgentDefinition { Id = "request-agent", Model = ${JSON.stringify(model)}${instructions ? `, Instructions = ${JSON.stringify(instructions)}` : ""} });\nvar client = AgentSdk.CreateGatewayAgentClient(${request.baseUrl || gatewayTools.length ? `new GatewayAgentClientOptions { ${[request.baseUrl ? `ClientOptions = new Dictionary<string, object?> { ["baseUrl"] = ${JSON.stringify(request.baseUrl)} }` : "", gatewayTools.length ? `GatewayTools = JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(${JSON.stringify(JSON.stringify(gatewayTools))})!` : ""].filter(Boolean).join(", ")} }` : ""});\nvar result = await agent.Run(new RunOptions { Input = ${JSON.stringify(input)}, Client = client });\nConsole.WriteLine(result.Output);\n`;
  if (language === "java") return `// Maven: app.phaseo:phaseo-agent-sdk\nimport app.phaseo.agent.AgentSdk;\n${gatewayTools.length ? "import com.fasterxml.jackson.core.type.TypeReference;\nimport com.fasterxml.jackson.databind.ObjectMapper;\nimport java.util.Map;\n" : ""}import java.util.List;\n\npublic final class Main {\n  public static void main(String[] args) throws Exception {\n    var agent = AgentSdk.createAgent(new AgentSdk.AgentDefinition(\n        "request-agent", ${JSON.stringify(model)}, null, ${instructions ? JSON.stringify(instructions) : "null"}, List.of(), 12, null, null, null, null\n    ));\n    var client = AgentSdk.createGatewayAgentClient(${request.baseUrl || gatewayTools.length ? `new AgentSdk.GatewayOptions(null, null, ${request.baseUrl ? JSON.stringify(request.baseUrl) : "null"}, null, null, ${gatewayTools.length ? `Map.of("tools", new ObjectMapper().readValue(${JSON.stringify(JSON.stringify(gatewayTools))}, new TypeReference<List<Map<String, Object>>>() {}))` : "null"})` : ""});\n    var result = agent.run(new AgentSdk.RunOptions(\n        ${JSON.stringify(input)}, client, null, null, null, null, null, null, null, null\n    ));\n    System.out.println(result.output());\n  }\n}\n`;
  if (language === "php") return `<?php\n// composer require phaseo/sdk phaseo/agent-sdk\nrequire "vendor/autoload.php";\nuse Phaseo\\AgentSdk\\AgentDefinition;\nuse Phaseo\\AgentSdk\\AgentSdk;\nuse Phaseo\\AgentSdk\\GatewayAgentClientOptions;\n\n$agent = AgentSdk::createAgent(new AgentDefinition(id: "request-agent", model: ${singleQuotedLiteral(model)}${instructions ? `, instructions: ${singleQuotedLiteral(instructions)}` : ""}));\n$client = AgentSdk::createGatewayAgentClient(${request.baseUrl || gatewayTools.length ? `new GatewayAgentClientOptions(${[request.baseUrl ? `clientOptions: ["base_url" => ${singleQuotedLiteral(request.baseUrl)}]` : "", gatewayTools.length ? `gatewayTools: json_decode(${singleQuotedLiteral(JSON.stringify(gatewayTools))}, true, flags: JSON_THROW_ON_ERROR)` : ""].filter(Boolean).join(", ")})` : ""});\n$result = $agent->run(input: ${singleQuotedLiteral(input)}, client: $client);\necho $result->output . PHP_EOL;\n`;
  if (language === "ruby") return `# gem install phaseo_sdk phaseo_agent_sdk\n${gatewayTools.length ? 'require "json"\n' : ""}require "phaseo_agent_sdk"\n\nagent = PhaseoAgentSdk.create_agent(id: "request-agent", model: ${singleQuotedLiteral(model)}${instructions ? `, instructions: ${singleQuotedLiteral(instructions)}` : ""})\nclient = PhaseoAgentSdk.create_gateway_agent_client(${[request.baseUrl ? `base_url: ${singleQuotedLiteral(request.baseUrl)}` : "", gatewayTools.length ? `gateway_tools: JSON.parse(${singleQuotedLiteral(JSON.stringify(gatewayTools))})` : ""].filter(Boolean).join(", ")})\nresult = agent.run(input: ${singleQuotedLiteral(input)}, client: client)\nputs result.output\n`;
  return `# Cargo.toml: phaseo = "0.1", phaseo-agent = "0.1"\nuse phaseo::Phaseo;\nuse phaseo_agent::{create_agent, AgentDefinition, GatewayAgentClient, RunOptions};\n${gatewayTools.length ? "use serde_json::json;\n" : ""}\nfn main() -> Result<(), Box<dyn std::error::Error>> {\n    let agent = create_agent(AgentDefinition::new("request-agent", ${rustRawLiteral(model)})${instructions ? `.instructions(${rustRawLiteral(instructions)})` : ""});\n    let phaseo = Phaseo::from_env()?${request.baseUrl ? `.with_base_url(${rustRawLiteral(request.baseUrl)})?` : ""};\n    let mut client = GatewayAgentClient::new(phaseo, ${rustRawLiteral(model)})${gatewayTools.length ? `.with_gateway_tools(vec![${gatewayTools.map(tool => `json!(${JSON.stringify(tool)})`).join(", ")}])` : ""};\n    let result = agent.run(&mut client, RunOptions::new(${rustRawLiteral(input)}))?;\n    println!("{}", result.output);\n    Ok(())\n}\n`;
}

function agentCode(request: SdkRequest, language: AgentLanguage): string {
  const code = agentCodeWithoutHistoryNote(request, language);
  if (!normalizeAgentInput(request).omitsHistory) return code;
  const marker = language === "python" || language === "ruby" ? "#" : "//";
  const firstLineEnd = code.indexOf("\n");
  const note = `${marker} Starts a new agent run from the latest user turn; prior chat messages are not replayed.\n`;
  return firstLineEnd < 0 ? `${code}\n${note}` : `${code.slice(0, firstLineEnd + 1)}${note}${code.slice(firstLineEnd + 1)}`;
}

function curlCode(request: SdkRequest) {
  const baseUrl = posixShellLiteral((request.baseUrl ?? "https://api.phaseo.app/v1").replace(/\/$/, ""));
  return `curl --request POST \\\n  --url ${baseUrl}${request.endpoint} \\\n  --header "Authorization: Bearer $PHASEO_API_KEY" \\\n  --header "Content-Type: application/json" \\\n  --data-binary @- <<'JSON'\n${JSON.stringify(request.body, null, 2)}\nJSON\n`;
}

function genericSdkCode(request: SdkRequest, language: Exclude<SdkLanguage, "typescript" | "python">): string {
  const body = JSON.stringify(request.body, null, 2);
  const endpoint = JSON.stringify(request.endpoint);
  const baseUrl = request.baseUrl ?? "https://api.phaseo.app/v1";
  if (language === "go") return `// go get github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3@latest\npackage main\n\nimport (\n  "context"\n  "encoding/json"\n  "fmt"\n  "os"\n  phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3"\n)\n\nfunc main() {\n  client := phaseo.NewPhaseo(os.Getenv("PHASEO_API_KEY"), ${JSON.stringify(baseUrl)})\n  var payload map[string]any\n  if err := json.Unmarshal([]byte(${JSON.stringify(body)}), &payload); err != nil { panic(err) }\n  response, err := client.Request(context.Background(), "POST", ${endpoint}, nil, nil, payload)\n  if err != nil { panic(err) }\n  fmt.Println(response)\n}\n`;
  if (language === "csharp") return `// dotnet add package Phaseo.Sdk\nusing System.Text.Json;\nusing PhaseoSdk;\n\nvar client = new Phaseo(apiKey: Environment.GetEnvironmentVariable("PHASEO_API_KEY"), basePath: ${JSON.stringify(baseUrl)});\nvar payload = JsonSerializer.Deserialize<Dictionary<string, object>>(${JSON.stringify(body)})!;\nvar response = await client.RequestWithResponse("POST", ${endpoint}, body: payload);\nConsole.WriteLine(JsonSerializer.Serialize(response.Data));\n`;
  if (language === "java") return `// Maven: app.phaseo:phaseo-sdk\nimport app.phaseo.sdk.Phaseo;\nimport com.fasterxml.jackson.core.type.TypeReference;\nimport com.fasterxml.jackson.databind.ObjectMapper;\nimport java.util.Map;\n\npublic final class Main {\n  public static void main(String[] args) throws Exception {\n    var client = new Phaseo(System.getenv("PHASEO_API_KEY"), ${JSON.stringify(baseUrl)});\n    var payload = new ObjectMapper().readValue(${JSON.stringify(body)}, new TypeReference<Map<String, Object>>() {});\n    var response = client.request("POST", ${endpoint}, null, null, payload);\n    System.out.println(response);\n  }\n}\n`;
  if (language === "php") return `<?php\n// composer require phaseo/sdk\nrequire "vendor/autoload.php";\nuse Phaseo\\Sdk\\Phaseo;\n\n$client = new Phaseo(apiKey: getenv("PHASEO_API_KEY"), basePath: ${singleQuotedLiteral(baseUrl)});\n$payload = json_decode(${singleQuotedLiteral(body)}, true, flags: JSON_THROW_ON_ERROR);\n$response = $client->requestWithResponse("POST", ${endpoint}, body: $payload);\necho $response->body . PHP_EOL;\n`;
  if (language === "ruby") return `# gem install phaseo_sdk\nrequire "json"\nrequire "phaseo_sdk"\n\nclient = PhaseoSdk::Phaseo.new(api_key: ENV.fetch("PHASEO_API_KEY"), base_path: ${singleQuotedLiteral(baseUrl)})\npayload = JSON.parse(${singleQuotedLiteral(body)})\nresponse = client.request_with_response(method: "POST", path: ${endpoint}, body: payload)\nputs response.body\n`;
  if (language === "rust") return `# Cargo.toml: phaseo = "0.1", serde_json = "1"\nuse phaseo::Phaseo;\nuse serde_json::Value;\n\nfn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = Phaseo::from_env()?${request.baseUrl ? `.with_base_url(${rustRawLiteral(request.baseUrl)})?` : ""};\n    let payload: Value = serde_json::from_str(${rustRawLiteral(body)})?;\n    let response = client.post(${endpoint}, &payload)?;\n    println!("{}", response.body);\n    Ok(())\n}\n`;
  const operation = cppOperations[request.endpoint];
  if (!operation) throw new Error("This endpoint has no C++ SDK export");
  return `// Provide a phaseo::gen::Transport implementation for your HTTP stack.\n#include <cstdlib>\n#include <iostream>\n#include <string>\n#include "phaseo/gen/client.hpp"\n#include "phaseo/gen/operations.hpp"\n\nint main() {\n  CurlTransport transport;\n  phaseo::gen::Client client(${JSON.stringify(baseUrl)}, &transport);\n  client.set_header("Authorization", std::string("Bearer ") + std::getenv("PHASEO_API_KEY"));\n  const std::string payload = ${cppRawLiteral(body)};\n  auto response = phaseo::gen::${operation}(client, {}, payload);\n  std::cout << response.body << std::endl;\n}\n`;
}

function typescriptOrPythonCode(request: SdkRequest, language: "typescript" | "python"): string {
  const method = methods[request.endpoint];
  const genericRequest = request.endpoint === "/audio/realtime/sessions";
  if (!method && !genericRequest) throw new Error("This endpoint has no SDK export");
  const body = JSON.stringify(request.body, null, 2);
  const streaming = request.body.stream === true && ["/responses", "/chat/completions", "/messages"].includes(request.endpoint);
  if (language === "typescript") {
    const config = request.baseUrl ? `, baseUrl: ${JSON.stringify(request.baseUrl)}` : "";
    const streamMethod = { "/responses": "streamResponses", "/chat/completions": "streamChat", "/messages": "streamMessages" }[request.endpoint];
    const call = streaming ? `for await (const event of client.${streamMethod}(${body})) {\n  process.stdout.write(event.text ?? "");\n}` : genericRequest ? `const result = await client.request("POST", ${JSON.stringify(request.endpoint)}, { body: ${body} });\nconsole.log(result);` : `const result = await client.${method![0]}(${body});\n${request.endpoint === "/audio/speech" ? 'await writeFile("speech.mp3", new Uint8Array(await result.arrayBuffer()));' : "console.log(result);"}`;
    return `// npm install @phaseo/sdk\nimport { Phaseo } from "@phaseo/sdk";\n${request.endpoint === "/audio/speech" ? 'import { writeFile } from "node:fs/promises";\n' : ""}\nconst client = new Phaseo({ apiKey: process.env.PHASEO_API_KEY${config} });\n\n${call}\n`;
  }
  const config = request.baseUrl ? `base_url=${JSON.stringify(request.baseUrl)}` : "";
  const call = streaming ? `async for event in client.${method![1].replace(/\.create$/, ".stream")}(request):\n            print(event.get("text", ""), end="", flush=True)` : genericRequest ? `result = await client.request("POST", ${JSON.stringify(request.endpoint)}, body=request)\n        print(result)` : `result = await client.${method![1]}(request)\n        ${request.endpoint === "/audio/speech" ? 'Path("speech.mp3").write_bytes(result)' : "print(result)"}`;
  return `# pip install phaseo\nimport asyncio\n${request.endpoint === "/audio/speech" ? "from pathlib import Path\n" : ""}from phaseo import AsyncPhaseo\n\nasync def main():\n    request = ${pythonLiteral(request.body)}\n    async with AsyncPhaseo(${config}) as client:\n        ${call}\n\nasyncio.run(main())\n`;
}

export function sdkCode(request: SdkRequest, sample: SdkSample | SdkLanguage): string {
  if (sample === "curl") return curlCode(request);
  if (sample.startsWith("agent-")) return agentCode(request, sample.replace("agent-", "") as AgentLanguage);
  const language = sample.startsWith("sdk-") ? sample.replace("sdk-", "") as SdkLanguage : sample as SdkLanguage;
  if (language === "typescript" || language === "python") return typescriptOrPythonCode(request, language);
  return genericSdkCode(request, language);
}

let lastRequest: SdkRequest | null = null;
const subscribers = new Set<() => void>();
export const sdkExportStore = {
  get: () => lastRequest,
  subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
  set(request: SdkRequest | null) { lastRequest = request; subscribers.forEach(listener => listener()); },
};
