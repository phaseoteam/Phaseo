import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";
import { MODEL_IDS, MODEL_ID_SET, ModelIds } from "../src/modelIds.js";

describe("Phaseo models helper", () => {
  test.each(["../..", "author/.", "./model"])("rejects dot-segment capability IDs %s before fetching", async modelId => {
    const fetchImpl = vi.fn();
    const client = new Phaseo({ apiKey: "test", baseUrl: "https://example.test/v1", fetchImpl });
    await expect(client.getModelEndpointCapabilities(modelId)).rejects.toThrow(/Dot segments/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test("encodes capability path delimiters while preserving dotted model names", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input)).pathname).toBe("/v1/models/author/model.1%3Fx%23fragment/endpoints");
      return Response.json({ id: "author/model.1?x#fragment", endpoints: [] });
    });
    const client = new Phaseo({ apiKey: "test", baseUrl: "https://example.test/v1", fetchImpl });
    await client.getModelEndpointCapabilities("author/model.1?x#fragment");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  test("publishes Claude Opus 4.8 in the model ID helpers", () => {
    expect(ModelIds.ANTHROPIC_CLAUDE_OPUS_4_8).toBe("anthropic/claude-opus-4.8");
    expect(MODEL_IDS).toContain("anthropic/claude-opus-4.8");
    expect(MODEL_ID_SET.has("anthropic/claude-opus-4.8")).toBe(true);
  });

  test("preserves preview-only and coming-soon provider availability metadata from /models", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/models");
      expect(url.searchParams.get("availability")).toBe("all");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          availability_mode: "all",
          models: [
            {
              id: "openai/gpt-5-mini",
              model_id: "openai/gpt-5-mini",
              providers: [
                {
                  api_provider_id: "openai",
                  is_active_gateway: false,
                  availability_status: "coming_soon",
                  availability_reason: "preview_only",
                  provider_status: "beta",
                  provider_routing_status: "active",
                  model_routing_status: "active",
                  capability_status: "coming_soon",
                  endpoints: ["responses"],
                  params: ["temperature"],
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getModels({ availability: "all" }) as any;

    expect(response.availability_mode).toBe("all");
    expect(response.models[0].providers[0].availability_status).toBe("coming_soon");
    expect(response.models[0].providers[0].availability_reason).toBe("preview_only");
    expect(response.models[0].providers[0].capability_status).toBe("coming_soon");
  });

  test("forwards provider availability filters to /models", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const statusValues = url
        .searchParams
        .getAll("provider_availability_status")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      const reasonValues = url
        .searchParams
        .getAll("provider_availability_reason")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/models");
      expect(statusValues).toEqual(["coming_soon", "inactive"]);
      expect(reasonValues).toEqual(["preview_only", "provider_not_ready"]);
      return new Response(
        JSON.stringify({
          ok: true,
          models: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getModels({
      provider_availability_status: ["coming_soon", "inactive"] as any,
      provider_availability_reason: ["preview_only", "provider_not_ready"] as any,
    }) as any;

    expect(response.ok).toBe(true);
  });

  test("forwards provider and capability status filters to /models", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const providerStatusValues = url
        .searchParams
        .getAll("provider_status")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      const capabilityStatusValues = url
        .searchParams
        .getAll("capability_status")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/models");
      expect(providerStatusValues).toEqual(["beta", "alpha"]);
      expect(capabilityStatusValues).toEqual(["coming_soon", "internal_testing", "disabled"]);
      return new Response(
        JSON.stringify({
          ok: true,
          models: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getModels({
      provider_status: ["beta", "alpha"] as any,
      capability_status: ["coming_soon", "internal_testing", "disabled"] as any,
    }) as any;

    expect(response.ok).toBe(true);
  });

  test("forwards provider and model routing status filters to /models", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const providerRoutingValues = url
        .searchParams
        .getAll("provider_routing_status")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      const modelRoutingValues = url
        .searchParams
        .getAll("model_routing_status")
        .flatMap((value) => value.split(","))
        .filter(Boolean);
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/models");
      expect(providerRoutingValues).toEqual(["deranked_lvl1", "disabled"]);
      expect(modelRoutingValues).toEqual(["active", "deranked_lvl2"]);
      return new Response(
        JSON.stringify({
          ok: true,
          models: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getModels({
      provider_routing_status: ["deranked_lvl1", "disabled"] as any,
      model_routing_status: ["active", "deranked_lvl2"] as any,
    }) as any;

    expect(response.ok).toBe(true);
  });
});
