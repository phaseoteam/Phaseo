import { afterEach, describe, expect, it } from "vitest";
import { ProviderMockServer } from "./server.js";

const servers: ProviderMockServer[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => server.stop())));

describe("ProviderMockServer", () => {
  it("registers OpenAPI operations and rejects undocumented parameters", async () => {
    const server = new ProviderMockServer().registerOpenApi("strict-ai", {
      openapi: "3.1.0",
      paths: {
        "/v1/chat/completions": {
          post: {
            operationId: "createChatCompletion",
            requestBody: { content: { "application/json": { schema: {
              type: "object",
              required: ["model", "messages"],
              additionalProperties: false,
              properties: { model: { type: "string" }, messages: { type: "array" } },
            } } } },
            responses: { "200": { content: { "application/json": { example: { choices: [] } } } } },
          },
        },
      },
    });
    servers.push(server);
    await server.start();

    const response = await fetch(`${server.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-id": "drop-test" },
      body: JSON.stringify({ model: "mock", messages: [], service_tier: "auto" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { param: "service_tier" } });
    expect(server.getLastRequest()).toMatchObject({
      providerId: "strict-ai",
      operationId: "createChatCompletion",
      headers: { "x-test-id": "drop-test" },
      response: { status: 400 },
    });
  });

  it("supports deterministic per-test faults without live provider calls", async () => {
    const server = new ProviderMockServer()
      .register({ providerId: "openai", operationId: "responses", method: "POST", path: "/v1/responses", response: { body: { id: "ok" } } })
      .fault({ providerId: "openai", operationId: "responses", testId: "rate-limit", response: { status: 429, body: { error: { type: "rate_limit_error" } } } });
    servers.push(server);
    await server.start();
    const request = () => fetch(`${server.url}/v1/responses`, { method: "POST", headers: { "content-type": "application/json", "x-test-id": "rate-limit" }, body: "{}" });
    expect((await request()).status).toBe(429);
    expect((await request()).status).toBe(200);
    expect(server.getRequests()).toHaveLength(2);
  });
});
