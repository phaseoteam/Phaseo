import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo pricing calculation helper", () => {
  test("calls /pricing/calculate through calculatePricing", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/pricing/calculate");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.provider).toBe("openai");
      expect(body.model).toBe("openai/gpt-5-mini");
      expect(body.endpoint).toBe("responses");
      expect(body.usage?.input_tokens).toBe(1000);
      return new Response(
        JSON.stringify({
          ok: true,
          pricing: {
            total_cost_usd: 0.00025,
            currency: "USD",
          },
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

    const response = await client.calculatePricing({
      provider: "openai",
      model: "openai/gpt-5-mini",
      endpoint: "responses",
      usage: { input_tokens: 1000 },
    }) as any;

    expect(response.ok).toBe(true);
    expect(response.pricing.total_cost_usd).toBe(0.00025);
  });
});
