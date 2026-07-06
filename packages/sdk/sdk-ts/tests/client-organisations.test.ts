import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo organisations discovery helper", () => {
  test("calls /organisations through listOrganisations", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/organisations");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("offset")).toBe("3");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          limit: 2,
          offset: 3,
          total: 1,
          organisations: [
            {
              organisation_id: "org_123",
              name: "Anthropic",
              country_code: "US",
              colour: "#D97706",
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

    const response = await client.listOrganisations({ limit: 2, offset: 3 }) as any;

    expect(response.ok).toBe(true);
    expect(response.organisations[0].organisation_id).toBe("org_123");
    expect(response.organisations[0].name).toBe("Anthropic");
  });
});
