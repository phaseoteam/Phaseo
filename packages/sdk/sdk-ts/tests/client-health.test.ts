import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo health helper", () => {
	test.each([
		["eu", "https://eu.api.phaseo.app/v1/health"],
		["us", "https://us.api.phaseo.app/v1/health"],
	] as const)("selects the %s regional endpoint", async (region, expectedUrl) => {
		const fetchImpl: typeof fetch = vi.fn(async (input) => {
			expect(String(input)).toBe(expectedUrl);
			return new Response(JSON.stringify({ status: "ok" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;
		const client = new Phaseo({ apiKey: "sk_test_123", region, fetchImpl });
		await client.getHealth();
	});

	test("rejects ambiguous base URL and region options", () => {
		expect(() => new Phaseo({
			apiKey: "sk_test_123",
			baseUrl: "https://example.test/v1",
			region: "eu",
		})).toThrow("baseUrl and region cannot be used together");
	});

	test("rejects an explicitly empty base URL with a region", () => {
		expect(() => new Phaseo({
			apiKey: "sk_test_123",
			baseUrl: "",
			region: "eu",
		})).toThrow("baseUrl and region cannot be used together");
	});

  test("calls /health through getHealth", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/health");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: "2026-05-05T12:00:00.000Z",
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

    const response = await client.getHealth();

    expect(response.status).toBe("ok");
    expect(response.timestamp).toBe("2026-05-05T12:00:00.000Z");
  });

  test("adds app attribution only when explicitly configured", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        "X-App-Id": "support-console",
        "X-App-Name": "Support Console",
        "HTTP-Referer": "https://support.example.com",
        "X-App-Categories": "productivity,developer-tools",
      });
      return new Response(JSON.stringify({ status: "ok", timestamp: "2026-08-19T00:00:00.000Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      app: {
        id: "support-console",
        name: "Support Console",
        url: "https://support.example.com",
        categories: ["productivity", "developer-tools"],
      },
    });

    await client.getHealth();
  });
});
