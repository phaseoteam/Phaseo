import { createHmac } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";
import { OpenAI } from "../src/compat/openai.js";
import { PhaseoHttpError } from "../src/runtime/client.js";

describe("Phaseo batch helpers", () => {
  test("preserves gateway metadata across create and retrieve batch helpers", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://example.test/batches" && init?.method === "POST") {
        expect(init?.body).toBeTruthy();
        const payload = JSON.parse(String(init.body));
        expect(payload.session_id).toBe("session_ts_batch_1");
        expect(payload.webhook).toEqual({
          url: "https://example.com/hooks/batch",
          secret: "whsec_batch",
          events: ["batch.completed"],
        });
        return new Response(JSON.stringify({
          id: "batch_123",
          native_batch_id: "batch_native_123",
          object: "batch",
          status: "validating",
          websocket_url: "wss://example.test/v1/async/batch/batch_123/ws",
          next_webhook_retry_at: "2026-05-03T10:02:34.000Z",
          last_webhook_progress: 25,
          last_webhook_progress_at: "2026-05-03T10:01:30.000Z",
          webhook: {
            url: "https://example.com/hooks/batch",
            events: ["batch.completed"],
            has_secret: true,
            delivery: {
              status: "pending",
              attempt_count: 0,
            },
          },
          provider: "openai",
          request_id: "req_ts_batch_1",
          session_id: "session_ts_batch_1",
          pricing_lines: [{ provider: "openai", cost_usd: 0.03 }],
          billing: {
            state: "estimated",
            reservation_status: "held",
            reserved_nanos: 30000000,
          },
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
          websocket_url: "wss://example.test/v1/async/batch/batch_123/ws",
          provider: "openai",
          request_id: "req_ts_batch_2",
          session_id: "session_ts_batch_1",
          request_counts: { total: 4, completed: 3, failed: 1 },
          billing: {
            charged: true,
            state: "settled",
            reservation_status: "settled",
            cost_usd: 0.12,
          },
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

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const created = await client.createBatch({
      endpoint: "/v1/responses",
      input_file_id: "file_123",
      completion_window: "24h",
      session_id: "session_ts_batch_1",
      webhook: {
        url: "https://example.com/hooks/batch",
        secret: "whsec_batch",
        events: ["batch.completed"],
      },
    } as any);
    const retrieved = await client.getBatch("batch_123");

    expect(created.provider).toBe("openai");
    expect(created.native_batch_id).toBe("batch_native_123");
    expect(created.request_id).toBe("req_ts_batch_1");
    expect(created.session_id).toBe("session_ts_batch_1");
    expect(created.websocket_url).toBe("wss://example.test/v1/async/batch/batch_123/ws");
    expect(created.next_webhook_retry_at).toBe("2026-05-03T10:02:34.000Z");
    expect(created.last_webhook_progress).toBe(25);
    expect(created.last_webhook_progress_at).toBe("2026-05-03T10:01:30.000Z");
    expect(created.webhook).toMatchObject({
      url: "https://example.com/hooks/batch",
      events: ["batch.completed"],
      has_secret: true,
      delivery: {
        status: "pending",
        attempt_count: 0,
      },
    });
    expect(created.pricing_lines).toEqual([{ provider: "openai", cost_usd: 0.03 }]);
    expect(created.billing).toMatchObject({
      state: "estimated",
      reservation_status: "held",
      reserved_nanos: 30000000,
    });

    expect(retrieved.provider).toBe("openai");
    expect(retrieved.request_id).toBe("req_ts_batch_2");
    expect(retrieved.session_id).toBe("session_ts_batch_1");
    expect(retrieved.websocket_url).toBe("wss://example.test/v1/async/batch/batch_123/ws");
    expect(retrieved.request_counts).toEqual({ total: 4, completed: 3, failed: 1 });
    expect(retrieved.billing).toEqual({
      charged: true,
      state: "settled",
      reservation_status: "settled",
      cost_usd: 0.12,
    });
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

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const batch = await client.cancelBatch("batch_123");

    expect(batch.id).toBe("batch_123");
    expect(batch.status).toBe("cancelling");
  });

  test("lists batches through listBatches with query filters", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches?status=in_progress&limit=2");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(JSON.stringify({
        object: "list",
        data: [
          {
            id: "batch_123",
            object: "batch",
            status: "in_progress",
            polling_url: "https://example.test/batches/batch_123",
            websocket_url: "wss://example.test/v1/async/batch/batch_123/ws",
            billing: {
              state: "estimated",
              reservation_status: "held",
            },
          },
        ],
        first_id: "batch_123",
        last_id: "batch_123",
        has_more: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listBatches({ status: "in_progress", limit: 2 });

    expect(response.object).toBe("list");
    expect(response.data[0]?.id).toBe("batch_123");
    expect(response.data[0]?.websocket_url).toBe("wss://example.test/v1/async/batch/batch_123/ws");
    expect(response.data[0]?.billing).toEqual({
      state: "estimated",
      reservation_status: "held",
    });
    expect(response.first_id).toBe("batch_123");
    expect(response.has_more).toBe(false);
  });

  test("serializes repeated batch status filters from arrays", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches?status=completed&status=canceled&limit=5");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        object: "list",
        data: [],
        first_id: null,
        last_id: null,
        has_more: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listBatches({ status: ["completed", "canceled"], limit: 5 });

    expect(response.data).toEqual([]);
  });

  test("surfaces HTTP errors from cancelBatch", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await expect(client.cancelBatch("batch_missing_123")).rejects.toBeInstanceOf(PhaseoHttpError);
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

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const batch = await client.batches.cancel("batch_456");

    expect(batch.id).toBe("batch_456");
    expect(batch.status).toBe("cancelling");
  });

  test("batches resource delegates to listBatches", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        object: "list",
        data: [],
        first_id: null,
        last_id: null,
        has_more: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.batches.list({ status: "completed" });

    expect(response).toEqual({
      object: "list",
      data: [],
      first_id: null,
      last_id: null,
      has_more: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/batches?status=completed",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("lists batch model capabilities through listBatchModels", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/models");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(JSON.stringify({
        object: "list",
        data: [
          {
            model: "openai/gpt-5-mini",
            supported_params_detail: {
              endpoint: {
                supported: true,
                values: ["/v1/responses"],
              },
            },
            supported_parameters_detail: {
              endpoint: {
                supported: true,
                values: ["/v1/responses"],
              },
            },
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listBatchModels();

    expect(response.object).toBe("list");
    expect(response.data[0]?.model).toBe("openai/gpt-5-mini");
    expect((response.data[0]?.supported_parameters_detail as any)?.endpoint?.values).toEqual(["/v1/responses"]);
  });

  test("batches resource delegates to listBatchModels", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/models");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        object: "list",
        data: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await expect(client.batches.listModels()).resolves.toEqual({
      object: "list",
      data: [],
    });
  });

  test("OpenAI compat batches expose list and cancel helpers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url === "https://example.test/batches?status=in_progress&limit=1" && method === "GET") {
        return new Response(JSON.stringify({
          object: "list",
          data: [
            {
              id: "batch_compat_1",
              object: "batch",
              status: "in_progress",
              billing: {
                state: "estimated",
                reservation_status: "held",
              },
            },
          ],
          first_id: "batch_compat_1",
          last_id: "batch_compat_1",
          has_more: false,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://example.test/batches/batch_compat_1/cancel" && method === "POST") {
        return new Response(JSON.stringify({
          id: "batch_compat_1",
          object: "batch",
          status: "cancelling",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://example.test/batches/models" && method === "GET") {
        return new Response(JSON.stringify({
          object: "list",
          data: [
            {
              model: "openai/gpt-5-mini",
              supported_parameters_detail: {
                endpoint: {
                  supported: true,
                  values: ["/v1/responses"],
                },
              },
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected_request", url, method }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);

    try {
      const client = new OpenAI({
        apiKey: "sk_test_123",
        baseURL: "https://example.test",
      });

      const list = await client.batches.list({ status: "in_progress", limit: 1 });
      const models = await client.batches.listModels();
      const cancelled = await client.batches.cancel("batch_compat_1");

      expect(list.data[0]?.id).toBe("batch_compat_1");
      expect(list.data[0]?.billing).toEqual({
        state: "estimated",
        reservation_status: "held",
      });
      expect(models.data[0]?.model).toBe("openai/gpt-5-mini");
      expect((models.data[0]?.supported_parameters_detail as any)?.endpoint?.values).toEqual(["/v1/responses"]);
      expect(cancelled.status).toBe("cancelling");
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://example.test/batches?status=in_progress&limit=1",
        expect.objectContaining({ method: "GET" }),
      );
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://example.test/batches/models",
        expect.objectContaining({ method: "GET" }),
      );
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://example.test/batches/batch_compat_1/cancel",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("lists tracked batch request rows", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/batch_123/requests?limit=50&offset=10&status=completed");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        object: "list",
        batch_id: "batch_123",
        data: [{
          id: "row_1",
          custom_id: "request-1",
          status: "completed",
          response_body: { id: "resp_1" },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test", fetchImpl });

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
      return new Response(JSON.stringify({
        id: "batch_123",
        object: "batch",
        status: statuses.shift() ?? "completed",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    try {
      const client = new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test", fetchImpl });
      const polled: string[] = [];
      const pending = client.batches.wait("batch_123", {
        intervalMs: 250,
        timeoutMs: 1_000,
        onPoll: (batch) => {
          polled.push(String(batch.status));
        },
      });

      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(250);
      const batch = await pending;

      expect(batch.status).toBe("completed");
      expect(polled).toEqual(["in_progress", "completed"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("verifies Phaseo signed webhook payloads", async () => {
    const body = JSON.stringify({ type: "batch.completed", data: { id: "batch_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    await expect(Phaseo.verifyWebhookSignature({
      body,
      secret: "whsec_test",
      timestamp,
      signature,
    })).resolves.toBe(true);

    const client = new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test" });
    await expect(client.webhooks.verifySignature({
      body,
      secret: "whsec_test",
      timestamp,
      signature: `sha256=${signature}`,
    })).resolves.toBe(true);
    await expect(client.webhooks.verifySignature({
      body,
      secret: "whsec_test",
      timestamp,
      signature: "sha256=bad",
    })).resolves.toBe(false);
  });
});
