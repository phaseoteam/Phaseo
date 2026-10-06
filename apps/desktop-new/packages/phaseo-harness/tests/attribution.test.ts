import { afterEach, expect, it, vi } from "vite-plus/test";
import { phaseoClient } from "../src/runner.js";

afterEach(() => vi.unstubAllGlobals());

it("attributes every gateway step to the same chat and desktop application", async () => {
  const requests: { headers: Headers; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(String(url)).toContain("https://api.phaseo.app/v1/responses");
    requests.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(
      JSON.stringify({
        id: "fixture-response",
        object: "response",
        status: "completed",
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done" }] },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const client = phaseoClient("fixture-secret", "chat-123");
  const request = {
    agentId: "fixture",
    model: "lab/model",
    messages: [],
    tools: [],
    context: undefined,
  };
  await client.generate(request);
  await client.generate(request);
  await phaseoClient("fixture-secret", "branch-456").generate(request);
  expect(requests.map((request) => request.body.session_id)).toEqual([
    "chat-123",
    "chat-123",
    "branch-456",
  ]);
  expect(requests.map((request) => request.headers.get("X-Session-Id"))).toEqual([
    "chat-123",
    "chat-123",
    "branch-456",
  ]);
  for (const { headers } of requests) {
    expect(headers.get("HTTP-Referer")).toBe("https://phaseo.app/desktop");
    expect(headers.get("X-Title")).toBe("Phaseo Desktop");
    expect(headers.get("X-App-Id")).toBe("phaseo-desktop");
    expect(headers.get("X-App-Name")).toBe("Phaseo Desktop");
  }
});
