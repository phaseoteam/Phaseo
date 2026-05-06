import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats provider and usage helpers", () => {
  test("calls /providers through listProviders", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/providers");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          providers: [
            { provider_id: "openai", name: "OpenAI" },
            { provider_id: "anthropic", name: "Anthropic" },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listProviders({ limit: 2 }) as any;

    expect(response.ok).toBe(true);
    expect(response.providers[0].provider_id).toBe("openai");
  });

  test("calls /credits through getCredits", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/credits");
      expect(url.searchParams.get("team_id")).toBe("team_123");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          credits: {
            balance_usd: 42.5,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getCredits({ team_id: "team_123" }) as any;

    expect(response.ok).toBe(true);
    expect(response.credits.balance_usd).toBe(42.5);
  });

  test("calls /activity through getActivity", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/activity");
      expect(url.searchParams.get("days")).toBe("30");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          total: 1,
          activity: [
            {
              request_id: "req_123",
              provider: "openai",
              model: "openai/gpt-5-mini",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getActivity({ days: 30 }) as any;

    expect(response.ok).toBe(true);
    expect(response.activity[0].request_id).toBe("req_123");
  });

  test("calls /analytics through getAnalytics", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/analytics");
      expect(url.searchParams.get("date")).toBe("2026-05-01");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          data: [
            {
              date: "2026-05-01",
              endpoint_id: "responses",
              requests: 12,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.getAnalytics({ date: "2026-05-01" }) as any;

    expect(response.data[0].endpoint_id).toBe("responses");
    expect(response.data[0].requests).toBe(12);
  });
});
