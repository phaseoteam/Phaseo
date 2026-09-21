import { agentSdkSupportReason, sdkCode, sdkRequestFromChat } from "./sdkExport";

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
  expect(python).toContain("request_options={");
});

test("only offers Agent SDK samples when a request can be converted safely", () => {
  expect(agentSdkSupportReason({ endpoint: "/images/generations", body: { prompt: "A lighthouse" } }))
    .toBe("Available for Responses requests");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { model: "phaseo/free" } }))
    .toBe("Add an input to use the Agent SDK");
  expect(agentSdkSupportReason({ endpoint: "/responses", body: { input: "Hello", tools: [{ type: "function" }] } }))
    .toBe("Remove request tools to create an agent starter");
});
