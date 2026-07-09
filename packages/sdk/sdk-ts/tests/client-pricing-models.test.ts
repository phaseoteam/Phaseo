import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo pricing models discovery helper", () => {
  test("calls /pricing/models through listPricingModels", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/pricing/models");
      expect(url.searchParams.get("provider")).toBe("openai");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          models: [
            {
              provider: "openai",
              model: "openai/gpt-5-mini",
              endpoint: "responses",
              display_name: "GPT-5 Mini",
              meters: [
                {
                  meter: "input_tokens",
                  unit: "tokens",
                  unit_size: 1000,
                  price_per_unit: "0.00025",
                  currency: "USD",
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

    const response = await client.listPricingModels({ provider: "openai" }) as any;

    expect(response.ok).toBe(true);
    expect(response.models[0].provider).toBe("openai");
    expect(response.models[0].endpoint).toBe("responses");
  });
});
