import { sdkCode, sdkRequestFromChat } from "./sdkExport";

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

test("realtime, polling and unknown routes are not presented as generation exports", () => {
  expect(sdkRequestFromChat("/api/chat/realtime/session", { method: "POST", body: '{"requestBody":{}}' })).toBeNull();
  expect(sdkRequestFromChat("/api/chat/video?id=v1", { method: "GET" })).toBeNull();
  expect(sdkRequestFromChat("/api/chat/unknown", { method: "POST", body: '{"requestBody":{}}' })).toBeNull();
});
