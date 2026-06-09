import { AIStats } from "../src/index.js";
import { DevToolsWriter } from "../src/devtools/core.js";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const TEST_DIR = `.ai-stats-devtools-test-${randomUUID()}`;

describe("DevTools Integration", () => {
  let client: AIStats;
  let writer: DevToolsWriter;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }

    // Create client with devtools enabled
    client = new AIStats({
      apiKey: process.env.AI_STATS_API_KEY || "test-key",
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 100
      }
    });

    writer = new DevToolsWriter(TEST_DIR);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("captures chat completion request", async () => {
    try {
      await client.generateText({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }]
      });
    } catch {
      // Expected to fail without real API key
    }

    // Wait for flush
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check that telemetry was captured
    const entries = writer.readEntries();
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0];
    expect(entry.type).toBe("chat.completions");
    expect(entry.request.model).toBe("gpt-4");
    expect(entry.request.messages).toHaveLength(1);
    expect(entry.metadata.sdk).toBe("typescript");
  });

  test("captures response routing metadata for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/chat/completions");
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({
        id: "req_ts_chat_1",
        nativeResponseId: "chatcmpl_ts_1",
        object: "chat.completion",
        created: 1_723_000_000,
        model: "openai/gpt-5-nano",
        provider: "openai",
        request_id: "req_ts_chat_1",
        session_id: "session_ts_chat_1",
        upstream_request_id: "upstream_ts_chat_1",
        pricing_lines: [{ provider: "openai", cost_usd: 0.0025 }],
        provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 412 }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    client = new AIStats({
      apiKey: "test-key",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 100
      }
    });

    await client.generateText({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: "hi" }]
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const entry = writer.readEntries()[0];
    expect(entry.type).toBe("chat.completions");
    expect(entry.metadata.request_id).toBe("req_ts_chat_1");
    expect(entry.metadata.session_id).toBe("session_ts_chat_1");
    expect(entry.metadata.upstream_request_id).toBe("upstream_ts_chat_1");
    expect(entry.metadata.pricing_lines).toEqual([{ provider: "openai", cost_usd: 0.0025 }]);
    expect(entry.metadata.provider_attempts).toEqual([{ provider: "openai", status_code: 200, duration_ms: 412 }]);
  });

  test("captures batch lifecycle metadata for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/batches" && method === "POST") {
        return new Response(JSON.stringify({
          id: "batch_123",
          object: "batch",
          status: "queued",
          endpoint: "/v1/responses",
          provider: "openai",
          request_id: "req_batch_create_ts_1",
          latency_ms: 111,
          generation_ms: 0,
          pricing_lines: [{ dimension: "batch_requests", units: 2 }],
          provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 111 }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/batches/batch_123" && method === "GET") {
        return new Response(JSON.stringify({
          id: "batch_123",
          object: "batch",
          status: "completed",
          endpoint: "/v1/responses",
          provider: "openai",
          request_id: "req_batch_retrieve_ts_1",
          output_file_id: "file_out_123",
          request_counts: { total: 2, completed: 2, failed: 0 },
          provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 84 }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/batches/batch_123/cancel" && method === "POST") {
        return new Response(JSON.stringify({
          id: "batch_123",
          object: "batch",
          status: "cancelled",
          provider: "openai",
          request_id: "req_batch_cancel_ts_1",
          pricing_lines: [{ dimension: "batch_requests", units: 0 }],
          provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 59 }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const batchClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await batchClient.createBatch({
      endpoint: "/v1/responses",
      input_file_id: "file_input_123",
      completion_window: "24h",
      session_id: "session_batch_ts_1",
      webhook: {
        url: "https://example.com/hooks/batch",
        events: ["job.completed"]
      }
    } as any);
    await batchClient.getBatch("batch_123");
    await batchClient.cancelBatch("batch_123");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(3);

    expect(entries[0]).toMatchObject({
      type: "batches.create",
      request: {
        endpoint: "/v1/responses",
        input_file_id: "file_input_123",
        session_id: "session_batch_ts_1",
        webhook: {
          url: "https://example.com/hooks/batch",
          events: ["job.completed"]
        }
      },
      metadata: {
        sdk: "typescript",
        provider: "openai",
        request_id: "req_batch_create_ts_1",
        latency_ms: 111,
        pricing_lines: [{ dimension: "batch_requests", units: 2 }],
        provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 111 }]
      }
    });

    expect(entries[1]).toMatchObject({
      type: "batches.retrieve",
      request: { batch_id: "batch_123" },
      response: {
        request_counts: { total: 2, completed: 2, failed: 0 },
        output_file_id: "file_out_123"
      },
      metadata: {
        provider: "openai",
        request_id: "req_batch_retrieve_ts_1",
        provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 84 }]
      }
    });

    expect(entries[2]).toMatchObject({
      type: "batches.cancel",
      request: { batch_id: "batch_123" },
      metadata: {
        provider: "openai",
        request_id: "req_batch_cancel_ts_1",
        pricing_lines: [{ dimension: "batch_requests", units: 0 }],
        provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 59 }]
      }
    });
  });

  test("captures generation lookup metadata for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/generations?id=gen_ts_1" && method === "GET") {
        return new Response(JSON.stringify({
          id: "gen_ts_1",
          provider: "openai",
          request_id: "req_generation_ts_1",
          session_id: "session_generation_ts_1",
          status_code: 200,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const generationClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await generationClient.getGeneration("gen_ts_1");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "generations.retrieve",
      request: { id: "gen_ts_1" },
      response: {
        id: "gen_ts_1",
        provider: "openai",
        request_id: "req_generation_ts_1",
        session_id: "session_generation_ts_1",
        status_code: 200,
      },
      metadata: {
        sdk: "typescript",
        provider: "openai",
        request_id: "req_generation_ts_1",
        session_id: "session_generation_ts_1",
      }
    });
  });

  test("captures api key listing requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/keys" && method === "GET") {
        expect(url.searchParams.get("disabled")).toBe("true");
        expect(url.searchParams.get("limit")).toBe("2");
        return new Response(JSON.stringify({
          object: "list",
          data: [
            { id: "key_123", status: "active" },
            { id: "key_456", status: "disabled" }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listApiKeys({ disabled: true, limit: 2 });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "provisioning.keys.list",
      request: {
        disabled: true,
        limit: 2
      },
      response: {
        object: "list"
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures api key retrieval requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/keys/key_123" && method === "GET") {
        return new Response(JSON.stringify({
          data: {
            id: "key_123",
            hash: "keyhash_123",
            status: "active"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.getApiKey("key_123");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "provisioning.keys.get",
      request: {
        id: "key_123"
      },
      response: {
        data: {
          id: "key_123",
          hash: "keyhash_123",
          status: "active"
        }
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures api key mutation requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/keys" && method === "POST") {
        return new Response(JSON.stringify({
          data: {
            id: "key_123",
            name: "Admin Key",
            status: "active"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/keys/key_123" && method === "PATCH") {
        return new Response(JSON.stringify({
          data: {
            id: "key_123",
            name: "Renamed Key",
            status: "disabled"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/keys/key_123" && method === "DELETE") {
        return new Response(JSON.stringify({
          data: {
            id: "key_123",
            deleted: true
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.createApiKey({ name: "Admin Key", scopes: ["gateway:read"] });
    await adminClient.updateApiKey("key_123", { name: "Renamed Key", disabled: true });
    await adminClient.deleteApiKey("key_123");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      type: "provisioning.keys.create",
      request: {
        name: "Admin Key",
        scopes: ["gateway:read"]
      },
      response: {
        data: {
          id: "key_123",
          status: "active"
        }
      }
    });
    expect(entries[1]).toMatchObject({
      type: "provisioning.keys.update",
      request: {
        id: "key_123",
        name: "Renamed Key",
        disabled: true
      },
      response: {
        data: {
          id: "key_123",
          status: "disabled"
        }
      }
    });
    expect(entries[2]).toMatchObject({
      type: "provisioning.keys.delete",
      request: {
        id: "key_123"
      },
      response: {
        data: {
          id: "key_123",
          deleted: true
        }
      }
    });
  });

  test("captures workspaces listing requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/workspaces" && method === "GET") {
        expect(url.searchParams.get("limit")).toBe("2");
        expect(url.searchParams.get("offset")).toBe("3");
        return new Response(JSON.stringify({
          object: "list",
          data: [
            { id: "ws_123", slug: "default" },
            { id: "ws_456", slug: "sandbox" }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listWorkspaces({ limit: 2, offset: 3 });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "provisioning.workspaces.list",
      request: {
        limit: 2,
        offset: 3
      },
      response: {
        object: "list"
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures workspace retrieval requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/workspaces/ws_123" && method === "GET") {
        return new Response(JSON.stringify({
          data: {
            id: "ws_123",
            slug: "default",
            name: "Default Workspace"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.getWorkspace("ws_123");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "provisioning.workspaces.get",
      request: {
        id: "ws_123"
      },
      response: {
        data: {
          id: "ws_123",
          slug: "default",
          name: "Default Workspace"
        }
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures workspace mutation requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/workspaces" && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Sandbox Workspace",
          slug: "sandbox"
        });
        return new Response(JSON.stringify({
          data: {
            id: "ws_123",
            slug: "sandbox",
            name: "Sandbox Workspace"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/workspaces/ws_123" && method === "PATCH") {
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Renamed Workspace",
          archived: true
        });
        return new Response(JSON.stringify({
          data: {
            id: "ws_123",
            slug: "sandbox",
            name: "Renamed Workspace",
            archived: true
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/workspaces/ws_123" && method === "DELETE") {
        return new Response(JSON.stringify({
          data: {
            id: "ws_123",
            deleted: true
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.createWorkspace({ name: "Sandbox Workspace", slug: "sandbox" });
    await adminClient.updateWorkspace("ws_123", { name: "Renamed Workspace", archived: true });
    await adminClient.deleteWorkspace("ws_123");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      type: "provisioning.workspaces.create",
      request: {
        name: "Sandbox Workspace",
        slug: "sandbox"
      },
      response: {
        data: {
          id: "ws_123",
          slug: "sandbox"
        }
      }
    });
    expect(entries[1]).toMatchObject({
      type: "provisioning.workspaces.update",
      request: {
        id: "ws_123",
        name: "Renamed Workspace",
        archived: true
      },
      response: {
        data: {
          id: "ws_123",
          archived: true
        }
      }
    });
    expect(entries[2]).toMatchObject({
      type: "provisioning.workspaces.delete",
      request: {
        id: "ws_123"
      },
      response: {
        data: {
          id: "ws_123",
          deleted: true
        }
      }
    });
  });

  test("captures provider and usage discovery requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();
      const pathname = `${url.origin}${url.pathname}`;

      if (pathname === "https://example.test/providers" && method === "GET") {
        expect(url.searchParams.get("limit")).toBe("2");
        return new Response(JSON.stringify({
          ok: true,
          providers: [
            { provider_id: "openai", name: "OpenAI" }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (pathname === "https://example.test/credits" && method === "GET") {
        expect(url.searchParams.get("team_id")).toBe("team_123");
        return new Response(JSON.stringify({
          ok: true,
          credits: {
            balance_usd: 42.5
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (pathname === "https://example.test/activity" && method === "GET") {
        expect(url.searchParams.get("days")).toBe("30");
        return new Response(JSON.stringify({
          ok: true,
          total: 1,
          activity: [
            {
              request_id: "req_123",
              provider: "openai",
              model: "openai/gpt-5-mini"
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (pathname === "https://example.test/analytics" && method === "GET") {
        expect(url.searchParams.get("date")).toBe("2026-05-01");
        return new Response(JSON.stringify({
          data: [
            {
              date: "2026-05-01",
              endpoint_id: "responses",
              requests: 12
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listProviders({ limit: 2 });
    await adminClient.getCredits({ team_id: "team_123" });
    await adminClient.getActivity({ days: 30 });
    await adminClient.getAnalytics({ date: "2026-05-01" });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      type: "providers",
      request: {
        limit: 2
      },
      response: {
        ok: true
      }
    });
    expect(entries[1]).toMatchObject({
      type: "credits",
      request: {
        team_id: "team_123"
      },
      response: {
        ok: true,
        credits: {
          balance_usd: 42.5
        }
      }
    });
    expect(entries[2]).toMatchObject({
      type: "activity",
      request: {
        days: 30
      },
      response: {
        ok: true,
        total: 1
      }
    });
    expect(entries[3]).toMatchObject({
      type: "analytics",
      request: {
        date: "2026-05-01"
      },
      response: {
        data: [
          {
            endpoint_id: "responses",
            requests: 12
          }
        ]
      }
    });
  });

  test("captures health requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/health" && method === "GET") {
        return new Response(JSON.stringify({
          status: "ok",
          timestamp: "2026-05-05T12:00:00.000Z"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.getHealth();

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "health",
      request: {},
      response: {
        status: "ok",
        timestamp: "2026-05-05T12:00:00.000Z"
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures organisations discovery requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/organisations" && method === "GET") {
        expect(url.searchParams.get("limit")).toBe("2");
        expect(url.searchParams.get("offset")).toBe("3");
        return new Response(JSON.stringify({
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
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listOrganisations({ limit: 2, offset: 3 });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "organisations.list",
      request: {
        limit: 2,
        offset: 3
      },
      response: {
        ok: true,
        total: 1
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures pricing-model discovery requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/pricing/models" && method === "GET") {
        expect(url.searchParams.get("provider")).toBe("openai");
        return new Response(JSON.stringify({
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
                  currency: "USD"
                }
              ]
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listPricingModels({ provider: "openai" });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "pricing.models",
      request: {
        provider: "openai"
      },
      response: {
        ok: true
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures pricing calculation requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/pricing/calculate" && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body.provider).toBe("openai");
        expect(body.model).toBe("openai/gpt-5-mini");
        expect(body.endpoint).toBe("responses");
        expect(body.usage?.input_tokens).toBe(1000);
        return new Response(JSON.stringify({
          ok: true,
          pricing: {
            total_cost_usd: 0.00025,
            currency: "USD"
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.calculatePricing({
      provider: "openai",
      model: "openai/gpt-5-mini",
      endpoint: "responses",
      usage: { input_tokens: 1000 }
    });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "pricing.calculate",
      request: {
        provider: "openai",
        model: "openai/gpt-5-mini",
        endpoint: "responses",
      },
      response: {
        ok: true,
        pricing: {
          total_cost_usd: 0.00025
        }
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures team-model discovery requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (`${url.origin}${url.pathname}` === "https://example.test/models" && method === "GET") {
        expect(url.searchParams.get("limit")).toBe("2");
        expect(url.searchParams.get("endpoints")).toBe("responses");
        return new Response(JSON.stringify({
          ok: true,
          limit: 2,
          models: [
            {
              id: "openai/gpt-5-mini",
              endpoints: ["responses"]
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.toString()}`);
    };

    const adminClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await adminClient.listTeamModels({ limit: 2, endpoints: "responses" });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "models.team",
      request: {
        limit: 2,
        endpoints: "responses"
      },
      response: {
        ok: true,
        limit: 2
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("captures video lifecycle metadata for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/videos" && method === "POST") {
        return new Response(JSON.stringify({
          id: "G-ts-video-1",
          object: "video",
          status: "queued",
          polling_url: "https://example.test/videos/G-ts-video-1",
          provider: "openai",
          model: "openai/sora-mini",
        }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/videos/G-ts-video-1" && method === "GET") {
        return new Response(JSON.stringify({
          id: "G-ts-video-1",
          object: "video",
          status: "completed",
          polling_url: "https://example.test/videos/G-ts-video-1",
          provider: "openai",
          model: "openai/sora-mini",
          content_url: "https://example.test/videos/G-ts-video-1/content",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://example.test/videos/G-ts-video-1/cancel" && method === "POST") {
        return new Response(JSON.stringify({
          id: "G-ts-video-1",
          object: "video",
          status: "cancelled",
          polling_url: "https://example.test/videos/G-ts-video-1",
          provider: "openai",
          model: "openai/sora-mini",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const videoClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await videoClient.generateVideo({
      model: "openai/sora-mini",
      prompt: "A glass sculpture melting into the sea"
    });
    await videoClient.getVideo("G-ts-video-1");
    await videoClient.cancelVideo("G-ts-video-1");

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(3);

    expect(entries[0]).toMatchObject({
      type: "video.generations",
      request: {
        model: "openai/sora-mini",
        prompt: "A glass sculpture melting into the sea"
      },
      metadata: {
        sdk: "typescript",
        provider: "openai",
        model: "openai/sora-mini"
      }
    });

    expect(entries[1]).toMatchObject({
      type: "video.retrieve",
      request: { video_id: "G-ts-video-1" },
      response: {
        id: "G-ts-video-1",
        status: "completed",
        content_url: "https://example.test/videos/G-ts-video-1/content"
      },
      metadata: {
        provider: "openai",
        model: "openai/sora-mini"
      }
    });

    expect(entries[2]).toMatchObject({
      type: "video.cancel",
      request: { video_id: "G-ts-video-1" },
      metadata: {
        provider: "openai",
        model: "openai/sora-mini"
      }
    });
  });

  test("captures video list requests for devtools", async () => {
    const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/videos?status=queued%2Ccompleted&limit=2" && method === "GET") {
        return new Response(JSON.stringify({
          object: "list",
          data: [
            { id: "G-ts-video-1", object: "video", status: "queued", polling_url: "https://example.test/videos/G-ts-video-1" },
            { id: "G-ts-video-2", object: "video", status: "completed", polling_url: "https://example.test/videos/G-ts-video-2" }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const videoClient = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      devtools: {
        enabled: true,
        directory: TEST_DIR,
        flushIntervalMs: 25
      }
    });

    await videoClient.listVideos({ status: "queued,completed", limit: 2 });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entries = writer.readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "video.list",
      request: {
        status: "queued,completed",
        limit: 2
      },
      response: {
        object: "list"
      },
      metadata: {
        sdk: "typescript"
      }
    });
  });

  test("respects enabled flag", () => {
    const disabledDir = `${TEST_DIR}-disabled`;
    if (fs.existsSync(disabledDir)) {
      fs.rmSync(disabledDir, { recursive: true });
    }

    const disabledClient = new AIStats({
      apiKey: "test-key",
      devtools: {
        enabled: false,
        directory: disabledDir
      }
    });

    // Directory should not be created when disabled
    expect(disabledClient).toBeDefined();
    expect(fs.existsSync(disabledDir)).toBe(false);
  });
});
