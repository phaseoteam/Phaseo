import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeRun,
  quoteRun,
  planRun,
  verifyQuote,
  InferenceRunReceipt,
  type InferenceEnv,
} from "../src/inference";
import type { AuthenticatedPhaseoUser, GatewayModel } from "../src/phaseo-api";

const user: AuthenticatedPhaseoUser = {
  accessToken: "upstream",
  resourceToken: "delegated",
  resource: "https://mcp.phaseo.app/mcp",
  workspaceId: "w1",
  userId: "u1",
  clientId: "c1",
  scopes: ["models:read", "pricing:read", "gateway:access"],
};
const input = {
  modelIds: ["lab/test"],
  prompt: "hello",
  maxOutputTokens: 512,
  maxEstimatedCostUsd: 0.1,
};
function model(price = "0.001"): GatewayModel {
  const meter = {
    unit: "token",
    unit_size: 1000,
    price_per_unit: price,
    currency: "USD",
    provider_id: "provider",
  };
  return {
    id: "lab/test",
    name: "Test",
    description: null,
    organization: null,
    lifecycle: {
      status: "active",
      released_at: null,
      deprecated_at: null,
      retires_at: null,
      replacement_id: null,
      message: null,
    },
    modalities: { input: ["text"], output: ["text"] },
    limits: { input_tokens: 128000, output_tokens: 2048 },
    capabilities: {
      endpoints: ["chat.completions"],
      parameters: ["max_tokens"],
      parameter_details: {},
    },
    availability: {
      status: "active",
      provider_count: 1,
      active_provider_count: 1,
      coming_soon_provider_count: 0,
      inactive_provider_count: 0,
    },
    pricing: { pricing_plan: "standard", meters: {} },
    offers: [
      {
        provider: { id: "provider", name: "Provider" },
        model: "test",
        status: "active",
        routable: true,
        capabilities: { parameters: ["max_tokens"], parameter_details: {} },
        pricing: {
          pricing_plan: "standard",
          meters: { input_tokens: meter, output_tokens: meter },
        },
      },
    ],
  };
}
function environment() {
  let claimed = false;
  const claim = vi.fn(async () => {
    const previous = claimed;
    claimed = true;
    return new Response(null, { status: previous ? 409 : 201 });
  });
  const requests: Request[] = [];
  let currentModel = model();
  const fetchMock = vi.fn(async (request: Request) => {
    requests.push(request);
    if (new URL(request.url).pathname === "/v1/models")
      return Response.json({ ok: true, models: [currentModel] });
    return Response.json({
      id: "request-1",
      choices: [{ message: { content: "Hello back" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 3 },
    });
  });
  const env = {
    PHASEO_API_BASE_URL: "https://api.phaseo.app",
    PHASEO_WEB_BASE_URL: "https://phaseo.app",
    PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
    PHASEO_API: { fetch: fetchMock },
    INFERENCE_RUNS: {
      idFromName: (value: string) => value,
      get: () => ({ fetch: claim }),
    },
  } as unknown as InferenceEnv;
  return {
    env,
    fetchMock,
    requests,
    claim,
    setModel: (value: GatewayModel) => {
      currentModel = value;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("reviewed inference", () => {
  it("does not retry failed or oversized output submissions", async () => {
    for (const response of [
      new Response(null, { status: 503 }),
      new Response("x".repeat(1024 * 1024 + 1)),
    ]) {
      const { env, fetchMock, requests } = environment();
      const quote = await quoteRun(env, user, input);
      const normalFetch = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (request: Request) => {
        if (request.method === "POST") {
          requests.push(request);
          return response;
        }
        return normalFetch(request);
      });
      const result = await executeRun(
        env,
        user,
        quote.quoteToken,
        input.prompt,
      );
      expect(result.results[0].error).toBeTruthy();
      expect(result.results[0].text).toBeNull();
      await expect(
        executeRun(env, user, quote.quoteToken, input.prompt),
      ).rejects.toThrow("already been submitted");
      expect(
        requests.filter((request) => request.method === "POST"),
      ).toHaveLength(1);
    }
  });
  it("submits only the reviewed provider and token limit and rejects repeat submissions", async () => {
    const { env, requests } = environment();
    const quote = await quoteRun(env, user, input);
    expect(quote.estimatedCostUsd).toBeCloseTo(0.000773);
    const result = await executeRun(env, user, quote.quoteToken, input.prompt);
    expect(result.results[0]).toMatchObject({
      text: "Hello back",
      requestId: "request-1",
      providerId: "provider",
    });
    const request = requests.find((item) => item.method === "POST")!;
    expect(request.headers.get("authorization")).toBe("Bearer delegated");
    expect(await request.json()).toMatchObject({
      model: "lab/test",
      max_completion_tokens: 512,
      store: false,
      stream: false,
      provider: {
        only: ["provider"],
        allow_fallbacks: false,
        require_parameters: true,
      },
    });
    await expect(
      executeRun(env, user, quote.quoteToken, input.prompt),
    ).rejects.toThrow("already been submitted");
    expect(requests.filter((item) => item.method === "POST")).toHaveLength(1);
  });
  it("rejects scope, prompt, actor, expiry, and signature changes without submitting", async () => {
    const { env, requests, claim } = environment();
    const quote = await quoteRun(env, user, input);
    await expect(
      executeRun(
        env,
        { ...user, scopes: ["models:read", "pricing:read"] },
        quote.quoteToken,
        input.prompt,
      ),
    ).rejects.toThrow("gateway:access");
    await expect(
      executeRun(env, user, quote.quoteToken, "different"),
    ).rejects.toThrow("another prompt");
    await expect(
      executeRun(
        env,
        { ...user, workspaceId: "w2" },
        quote.quoteToken,
        input.prompt,
      ),
    ).rejects.toThrow("another prompt");
    await expect(
      verifyQuote(
        `${quote.quoteToken}bad`,
        env.PHASEO_MCP_RESOURCE_SERVER_SECRET,
      ),
    ).rejects.toThrow("invalid");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    await expect(
      executeRun(env, user, quote.quoteToken, input.prompt),
    ).rejects.toThrow("expired");
    expect(claim).not.toHaveBeenCalled();
    expect(requests.every((item) => item.method === "GET")).toBe(true);
  });
  it("rejects price increases and over-budget quotes before claiming", async () => {
    const { env, setModel, claim } = environment();
    const quote = await quoteRun(env, user, input);
    setModel(model("1"));
    await expect(
      executeRun(env, user, quote.quoteToken, input.prompt),
    ).rejects.toThrow("Pricing changed");
    await expect(quoteRun(env, user, input)).rejects.toThrow("exceeds");
    expect(claim).not.toHaveBeenCalled();
  });
  it("rejects unsupported modalities, missing output limits and incomplete pricing", () => {
    const unsupported = model();
    unsupported.modalities.output = ["image"];
    expect(() => planRun(unsupported, input)).toThrow("does not support");
    const unlimited = model();
    unlimited.offers[0]!.capabilities.parameters = [];
    expect(() => planRun(unlimited, input)).toThrow("No eligible");
    const incomplete = model();
    incomplete.offers[0]!.pricing.meters.output_tokens = null;
    expect(() => planRun(incomplete, input)).toThrow("No eligible");
    expect(() => planRun(model(), { ...input, maxOutputTokens: 3000 })).toThrow(
      "cannot fit",
    );
  });
  it("stores only a receipt and atomically declines another claim", async () => {
    const data = new Map();
    const storage = {
      get: async (key: string) => data.get(key),
      put: async (key: string, value: unknown) => {
        data.set(key, value);
      },
      setAlarm: vi.fn(),
      deleteAll: async () => data.clear(),
      transaction: async (callback: (value: unknown) => unknown) =>
        callback(storage),
    };
    const receipt = new InferenceRunReceipt({
      storage,
    } as unknown as DurableObjectState);
    const request = () =>
      new Request("https://inference.internal/claim", {
        method: "POST",
        body: JSON.stringify({ expiresAt: Date.now() + 60000 }),
      });
    expect((await receipt.fetch(request())).status).toBe(201);
    expect((await receipt.fetch(request())).status).toBe(409);
    expect([...data.entries()]).toEqual([["claimed", true]]);
    await receipt.alarm();
    expect(data.size).toBe(0);
  });
});
