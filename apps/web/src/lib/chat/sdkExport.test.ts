import { agentSdkSupportReason, convertTextProtocol, protocolSwitchSupportReason, sdkCode, sdkRequestFromChat } from "./sdkExport";

test("exports the submitted body and selected endpoint without proxy credentials", () => {
  const request = sdkRequestFromChat("/api/chat/audio", { method: "POST", headers: { Authorization: "secret" }, body: JSON.stringify({
    action: "music", requestBody: { model: "google/lyria", prompt: "Piano", duration: 30 }, appHeaders: { Authorization: "secret" },
  }) });
  expect(request).toEqual({ endpoint: "/music/generate", body: { model: "google/lyria", prompt: "Piano", duration: 30 } });
  expect(sdkCode(request!, "typescript")).toContain("music.generateAndWait");
  expect(sdkCode(request!, "python")).toContain("music.generate_and_wait");
  expect(sdkCode(request!, "typescript")).not.toContain("secret");
});

test("redacts explicit credentials but preserves text and unusual JSON strings", () => {
  const body = { model: "test", input: 'A newline\nquote " and backslash \\', provider: { api_key: "secret" } };
  const request = sdkRequestFromChat("/api/chat/text", { method: "POST", body: JSON.stringify({ requestBody: body }) })!;
  expect(request.body.input).toBe(body.input);
  expect(request.body.provider).toEqual({ api_key: "REPLACE_WITH_YOUR_CREDENTIAL" });
  expect(sdkCode(request, "python")).toContain("request = {\n");
});

test("live-preview, polling and unknown routes are not presented as generation exports", () => {
  expect(sdkRequestFromChat("/api/chat/live/session", { method: "POST", body: '{"model":"openai/gpt-live-1"}' })).toBeNull();
  expect(sdkRequestFromChat("/api/chat/video?id=v1", { method: "GET" })).toBeNull();
  expect(sdkRequestFromChat("/api/chat/unknown", { method: "POST", body: '{"requestBody":{}}' })).toBeNull();
});

test("exports the public realtime session request instead of the private chat proxy", () => {
  const request = sdkRequestFromChat("/api/chat/realtime/session", {
    method: "POST",
    body: JSON.stringify({
      provider: "xai",
      model: "grok-voice",
      voice: "Ara",
      instructions: "Be concise.",
      thinkingLevel: "high",
    }),
  });

  expect(request).toEqual({
    endpoint: "/audio/realtime/sessions",
    body: {
      model: "spacex-ai/grok-voice",
      provider: "spacex-ai",
      voice: "Ara",
      instructions: "Be concise.",
      thinking_level: "high",
    },
  });
  expect(sdkCode(request!, "typescript")).toContain('client.request("POST", "/audio/realtime/sessions"');
  expect(sdkCode(request!, "python")).toContain('client.request("POST", "/audio/realtime/sessions", body=request)');
});

test.each([
  ["text", undefined, "responses.create", "responses.create"],
  ["image", undefined, "generateImage", "images.generate"],
  ["video", undefined, "videos.generateAndWait", "videos.generate_and_wait"],
  ["embeddings", undefined, "generateEmbedding", "embeddings.create"],
  ["moderation", undefined, "generateModeration", "moderations.create"],
  ["decisions", undefined, "decisions.make", "decisions.make"],
  ["ocr", undefined, "ocr.create", "ocr.create"],
  ["rerank", undefined, "rerank.create", "rerank.create"],
  ["audio", "speech", "generateSpeech", "audio.speech.create"],
  ["audio", "transcription", "generateTranscription", "audio.transcriptions.create"],
  ["audio", "translation", "generateTranslation", "audio.translations.create"],
  ["audio", "music", "music.generateAndWait", "music.generate_and_wait"],
])("uses real SDK methods for %s %s", (room, action, typescriptMethod, pythonMethod) => {
  const request = sdkRequestFromChat(`/api/chat/${room}`, {
    method: "POST",
    body: JSON.stringify({ action, requestBody: { model: "example/model", input: "Example" } }),
  });
  expect(request).not.toBeNull();
  expect(sdkCode(request!, "typescript")).toContain(`client.${typescriptMethod}`);
  expect(sdkCode(request!, "python")).toContain(`client.${pythonMethod}`);
});

test("builds runnable TypeScript and Python Agent SDK samples from Responses requests", () => {
  const request = {
    endpoint: "/responses",
    baseUrl: "https://api.phaseo.app/v1",
    body: {
      model: "phaseo/free",
      input: "Explain this request briefly.",
      instructions: "Be concise.",
      temperature: 0.2,
      max_output_tokens: 240,
      provider: { order: ["openai"] },
      service_tier: "priority",
      stream: true,
    },
  };

  expect(agentSdkSupportReason(request)).toBeNull();

  const typescript = sdkCode(request, "agent-typescript");
  expect(typescript).toContain('from "@phaseo/agent-sdk"');
  expect(typescript).toContain('model: "phaseo/free"');
  expect(typescript).toContain('input: "Explain this request briefly."');
  expect(typescript).toContain("maxOutputTokens: 240");
  expect(typescript).toContain('baseUrl: "https://api.phaseo.app/v1"');
  expect(typescript).toContain("requestOptions:");
  expect(typescript).toContain('"service_tier": "priority"');
  expect(typescript).not.toContain('"stream": true');

  const python = sdkCode(request, "agent-python");
  expect(python).toContain("from phaseo_agent import create_agent, create_gateway_agent_client");
  expect(python).toContain('"model": "phaseo/free"');
  expect(python).toContain('input="Explain this request briefly."');
  expect(python).toContain('"max_output_tokens": 240');
  expect(python).toContain('"base_url": "https://api.phaseo.app/v1"');
  expect(python).toContain('"api_key": os.environ["PHASEO_API_KEY"]');
  expect(python).toContain("request_options={");
});

test("maps gateway metadata flags to the Agent SDK option names", () => {
  const request = { endpoint: "/responses", body: { model: "phaseo/free", input: "Hello", meta: true } };
  expect(sdkCode(request, "agent-typescript")).toContain("includeMeta: true");
  expect(sdkCode(request, "agent-typescript")).not.toContain("\n  meta:");
  expect(sdkCode(request, "agent-python")).toContain("include_meta=True");
});

test("only offers Agent SDK samples when a request can be converted safely", () => {
  expect(agentSdkSupportReason({ endpoint: "/images/generations", body: { prompt: "A lighthouse" } }))
    .toBe("Available for text requests");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { model: "phaseo/free" } }))
    .toBe("Add an input to use the Agent SDK");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { input: "Hello", tools: [{ type: "function" }] } }))
    .toBe("Remove request tools to create an agent starter");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { input: [{ role: "assistant", content: "Earlier reply" }, { role: "user", content: "Continue" }] } }))
    .toBe("Start a new turn to create an agent starter");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,abc" }] }] } }))
    .toBe("Use text-only messages to create an agent starter");
});

test("normalizes a Responses message into runnable Agent SDK input and instructions", () => {
  const request = {
    endpoint: "/responses",
    body: {
      model: "phaseo/free",
      instructions: "Follow the house style.",
      input: [
        { role: "developer", content: "Be concise." },
        { role: "user", content: [{ type: "input_text", text: "Summarize this." }] },
      ],
    },
  };

  expect(agentSdkSupportReason(request)).toBeNull();
  expect(sdkCode(request, "agent-typescript")).toContain('instructions: "Follow the house style.\\n\\nBe concise."');
  expect(sdkCode(request, "agent-typescript")).toContain('input: "Summarize this."');
  expect(sdkCode(request, "agent-python")).toContain('"instructions": "Follow the house style.\\n\\nBe concise."');
  expect(sdkCode(request, "agent-python")).toContain('input="Summarize this."');
});

test("puts cURL on a complete public endpoint with the captured JSON body", () => {
  const code = sdkCode({ endpoint: "/rerank", body: { model: "cohere/rerank", query: "Best", documents: ["One", "Two"] } }, "curl");
  expect(code).toContain("curl --request POST");
  expect(code).toContain("--url 'https://api.phaseo.app/v1'/rerank");
  expect(code).toContain("Authorization: Bearer $PHASEO_API_KEY");
  expect(code).toContain('"documents": [');
});

test("shell-quotes custom cURL base URLs and avoids Ruby interpolation", () => {
  const request = { endpoint: "/responses", baseUrl: "https://example.com/#{danger}'$(danger)", body: { input: "Hello" } };
  expect(sdkCode(request, "curl")).toContain(`--url 'https://example.com/#{danger}'"'"'$(danger)'/responses`);
  expect(sdkCode(request, "sdk-ruby")).toContain("base_path: 'https://example.com/#{danger}\\'$(danger)'");
  expect(sdkCode(request, "sdk-php")).toContain("basePath: 'https://example.com/#{danger}\\'$(danger)'");
});

test.each([
  ["sdk-typescript", "@phaseo/sdk"], ["sdk-python", "from phaseo import AsyncPhaseo"],
  ["sdk-go", "sdk-go/v3"], ["sdk-csharp", "using PhaseoSdk"],
  ["sdk-java", "app.phaseo.sdk.Phaseo"], ["sdk-php", "Phaseo\\Sdk\\Phaseo"],
  ["sdk-ruby", "require \"phaseo_sdk\""], ["sdk-cpp", "phaseo::gen::CreateResponse"],
  ["sdk-rust", "use phaseo::Phaseo"],
] as const)("generates a Responses request for %s", (sample, marker) => {
  expect(sdkCode({ endpoint: "/responses", body: { model: "phaseo/free", input: "Hello" } }, sample)).toContain(marker);
});

test("uses captured base URLs in Go and the C# response payload property", () => {
  const request = { endpoint: "/responses", baseUrl: "http://localhost:8787/v1", body: { model: "phaseo/free", input: "Hello" } };
  const go = sdkCode(request, "sdk-go");
  expect(go).toContain('phaseo.NewPhaseo(os.Getenv("PHASEO_API_KEY"), "http://localhost:8787/v1")');
  expect(go).not.toContain("NewPhaseoFromEnv");
  expect(sdkCode(request, "sdk-csharp")).toContain("response.Data");
  expect(sdkCode(request, "sdk-rust")).toContain('.with_base_url(r#"http://localhost:8787/v1"#)?');
});

test.each([
  ["agent-go", 'BaseURL: "http://localhost:8787/v1"'],
  ["agent-csharp", '["baseUrl"] = "http://localhost:8787/v1"'],
  ["agent-java", 'new AgentSdk.GatewayOptions(null, null, "http://localhost:8787/v1"'],
  ["agent-php", '["base_url" => \'http://localhost:8787/v1\']'],
  ["agent-ruby", "base_url: 'http://localhost:8787/v1'"],
  ["agent-rust", '.with_base_url(r#"http://localhost:8787/v1"#)?'],
] as const)("uses the captured base URL for %s", (sample, marker) => {
  expect(sdkCode({ endpoint: "/responses", baseUrl: "http://localhost:8787/v1", body: { model: "phaseo/free", input: "Hello" } }, sample)).toContain(marker);
});

test.each([
  ["agent-typescript", "createGatewayAgentClient"], ["agent-python", "create_gateway_agent_client"],
  ["agent-go", "CreateGatewayAgentClient"], ["agent-csharp", "AgentSdk.CreateGatewayAgentClient"],
  ["agent-java", "AgentSdk.createGatewayAgentClient"], ["agent-php", "AgentSdk::createGatewayAgentClient"],
  ["agent-ruby", "PhaseoAgentSdk.create_gateway_agent_client"], ["agent-rust", "GatewayAgentClient::new"],
] as const)("generates an Agent SDK starter for %s", (sample, marker) => {
  expect(sdkCode({ endpoint: "/responses", body: { model: "phaseo/free", input: "Hello" } }, sample)).toContain(marker);
});

test("switches text-only requests between Responses, Chat Completions, and Messages shapes", () => {
  const source = {
    endpoint: "/responses",
    body: { model: "phaseo/free", instructions: "Be concise.", input: "Hello", max_output_tokens: 64, service_tier: "priority" },
  };
  const chat = convertTextProtocol(source, "chat-completions");
  expect(chat.endpoint).toBe("/chat/completions");
  expect(chat.body).toEqual({
    model: "phaseo/free",
    service_tier: "priority",
    messages: [{ role: "system", content: "Be concise." }, { role: "user", content: "Hello" }],
    max_completion_tokens: 64,
  });
  const messages = convertTextProtocol(chat, "messages");
  expect(messages.endpoint).toBe("/messages");
  expect(messages.body.system).toBe("Be concise.");
  expect(messages.body.max_tokens).toBe(64);
  expect(convertTextProtocol(messages, "responses")).toEqual(source);
});

test("preserves OpenAI text controls and disables incompatible Messages conversions", () => {
  const source = {
    endpoint: "/responses",
    body: {
      model: "phaseo/free", input: "Hello", presence_penalty: 0.2,
      frequency_penalty: 0.3, seed: 7, stop: ["DONE"], stream_options: { include_usage: true },
    },
  };
  const chat = convertTextProtocol(source, "chat-completions");
  expect(chat.body).toMatchObject({ presence_penalty: 0.2, frequency_penalty: 0.3, seed: 7, stop: ["DONE"], stream_options: { include_usage: true } });
  expect(protocolSwitchSupportReason(source, "chat-completions")).toBeNull();
  expect(protocolSwitchSupportReason(source, "messages")).toContain("presence_penalty");
});

test("maps stop controls between Messages and OpenAI text shapes", () => {
  const messages = {
    endpoint: "/messages",
    body: { model: "phaseo/free", messages: [{ role: "user", content: "Hello" }], max_tokens: 64, stop_sequences: ["DONE"] },
  };
  expect(convertTextProtocol(messages, "responses").body.stop).toEqual(["DONE"]);
  const responses = { endpoint: "/responses", body: { model: "phaseo/free", input: "Hello", stop: ["DONE"] } };
  expect(convertTextProtocol(responses, "messages").body.stop_sequences).toEqual(["DONE"]);
});

test("does not silently convert tool-bearing or multimodal protocol requests", () => {
  expect(() => convertTextProtocol({ endpoint: "/responses", body: { input: "Hello", tools: [{ type: "function" }] } }, "messages"))
    .toThrow("requires a request without tools");
  expect(() => convertTextProtocol({ endpoint: "/responses", body: { input: [{ role: "user", content: [{ type: "input_image", image_url: "example" }] }] } }, "messages"))
    .toThrow("requires text-only messages");
});
