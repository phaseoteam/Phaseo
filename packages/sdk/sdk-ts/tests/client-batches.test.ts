import { describe, expect, test, vi } from "vitest";
import { createHmac } from "node:crypto";
import { AIStats } from "../src/index.js";
import { AIStatsHttpError } from "../src/runtime/client.js";

describe("AIStats batch helpers", () => {
  test("preserves gateway metadata across create and retrieve batch helpers", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://example.test/batches" && init?.method === "POST") {
        expect(init?.body).toBeTruthy();
        const payload = JSON.parse(String(init.body));
        expect(payload.session_id).toBe("session_ts_batch_1");
        return new Response(JSON.stringify({
          id: "batch_123",
          object: "batch",
          status: "validating",
          provider: "openai",
          request_id: "req_ts_batch_1",
          session_id: "session_ts_batch_1",
          pricing_lines: [{ provider: "openai", cost_usd: 0.03 }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://example.test/batches/batch_123" && init?.method === "GET") {
        return new Response(JSON.stringify({
          id: "batch_123",
          object: "batch",
          status: "completed",
          provider: "openai",
          request_id: "req_ts_batch_2",
          session_id: "session_ts_batch_1",
          request_counts: { total: 4, completed: 3, failed: 1 },
          billing: { charged: true, cost_usd: 0.12 },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const created = await client.createBatch({
      endpoint: "/v1/responses",
      input_file_id: "file_123",
      completion_window: "24h",
      session_id: "session_ts_batch_1",
    } as any);
    const retrieved = await client.getBatch("batch_123");

    expect(created.provider).toBe("openai");
    expect(created.request_id).toBe("req_ts_batch_1");
    expect(created.session_id).toBe("session_ts_batch_1");
    expect(created.pricing_lines).toEqual([{ provider: "openai", cost_usd: 0.03 }]);

    expect(retrieved.provider).toBe("openai");
    expect(retrieved.request_id).toBe("req_ts_batch_2");
    expect(retrieved.session_id).toBe("session_ts_batch_1");
    expect(retrieved.request_counts).toEqual({ total: 4, completed: 3, failed: 1 });
    expect(retrieved.billing).toEqual({ charged: true, cost_usd: 0.12 });
  });

  test("cancels batches through cancelBatch", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/batch_123/cancel");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(JSON.stringify({
        id: "batch_123",
        object: "batch",
        status: "cancelling",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const batch = await client.cancelBatch("batch_123");

    expect(batch.id).toBe("batch_123");
    expect(batch.status).toBe("cancelling");
  });

  test("surfaces HTTP errors from cancelBatch", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await expect(client.cancelBatch("batch_missing_123")).rejects.toBeInstanceOf(AIStatsHttpError);
  });

  test("batches resource delegates to cancelBatch", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        id: "batch_456",
        object: "batch",
        status: "cancelling",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const batch = await client.batches.cancel("batch_456");

    expect(batch.id).toBe("batch_456");
    expect(batch.status).toBe("cancelling");
  });

  test("lists tracked batch request rows", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/batch_123/requests?limit=50&offset=10&status=completed");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        object: "list",
        batch_id: "batch_123",
        data: [
          {
            id: "row_1",
            custom_id: "request-1",
            status: "completed",
            response_body: { id: "resp_1" },
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const rows = await client.batches.listRequests("batch_123", {
      limit: 50,
      offset: 10,
      status: "completed",
    });

    expect(rows.batch_id).toBe("batch_123");
    expect(rows.data?.[0]?.custom_id).toBe("request-1");
    expect(rows.data?.[0]?.response_body).toEqual({ id: "resp_1" });
  });

  test("waits for an existing batch to reach a terminal status", async () => {
    vi.useFakeTimers();
    const statuses = ["in_progress", "completed"];
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/batch_123");
      expect(init?.method).toBe("GET");
      const status = statuses.shift() ?? "completed";
      return new Response(JSON.stringify({
        id: "batch_123",
        object: "batch",
        status,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const client = new AIStats({
        apiKey: "sk_test_123",
        baseUrl: "https://example.test",
        fetchImpl,
      });

      const polled: string[] = [];
      const pending = client.batches.wait("batch_123", {
        intervalMs: 250,
        timeoutMs: 1_000,
        onPoll: (batch) => {
          polled.push(String(batch.status));
        },
      });

      await vi.waitFor(() => {
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      });
      await vi.advanceTimersByTimeAsync(250);
      const batch = await pending;

      expect(batch.status).toBe("completed");
      expect(polled).toEqual(["in_progress", "completed"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("verifies AI Stats signed webhook payloads", async () => {
    const body = JSON.stringify({
      type: "batch.completed",
      data: { id: "batch_123" },
    });
    const timestamp = "1760000000";
    const signature = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    await expect(
      AIStats.verifyWebhookSignature({
        body,
        secret: "whsec_test",
        timestamp,
        signature,
      }),
    ).resolves.toBe(true);

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
    });
    await expect(
      client.webhooks.verifySignature({
        body,
        secret: "whsec_test",
        timestamp,
        signature: `sha256=${signature}`,
      }),
    ).resolves.toBe(true);
    await expect(
      client.webhooks.verifySignature({
        body,
        secret: "whsec_test",
        timestamp,
        signature: "sha256=bad",
      }),
    ).resolves.toBe(false);
  });
});
