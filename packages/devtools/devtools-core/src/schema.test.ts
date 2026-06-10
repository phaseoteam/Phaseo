import { describe, expect, it } from "vitest";
import { DevToolsEntrySchema } from "./schema.js";

describe("DevToolsEntrySchema", () => {
  it("accepts routing-aware metadata fields", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_123",
      type: "batches.cancel",
      timestamp: Date.now(),
      duration_ms: 1850,
      request: { batch_id: "batch_123", model: "openai/gpt-5.4-nano" },
      response: {
        request_id: "req_123",
        provider: "openai",
        status: "cancelling",
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        model: "openai/gpt-5.4-nano",
        provider: "openai",
        request_id: "req_123",
        session_id: "session_123",
        native_response_id: "chatcmpl_123",
        status_code: 200,
        latency_ms: 420,
        generation_ms: 1430,
        throughput: 182.5,
        finish_reason: "stop",
        pricing_lines: [{ dimension: "input_tokens", units: 12 }],
        provider_attempts: [
          {
            provider: "openrouter",
            status_code: 429,
            outcome: "rate_limited",
            duration_ms: 612,
            error_code: "rate_limit",
          },
          {
            provider: "openai",
            status_code: 200,
            outcome: "success",
            duration_ms: 420,
          },
        ],
      },
    });

    expect(parsed.metadata.request_id).toBe("req_123");
    expect(parsed.metadata.session_id).toBe("session_123");
    expect(parsed.metadata.provider_attempts).toHaveLength(2);
    expect(parsed.metadata.provider_attempts?.[0]?.status_code).toBe(429);
  });

  it("accepts endpoints discovery entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_endpoints_123",
      type: "endpoints.list",
      timestamp: Date.now(),
      duration_ms: 18,
      request: {},
      response: {
        ok: true,
        endpoints: ["chat/completions", "responses", "files"],
        sample_models: ["openai/gpt-5-nano"],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("endpoints.list");
    expect(parsed.response?.sample_models).toEqual(["openai/gpt-5-nano"]);
  });

  it("accepts current key discovery entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_key_123",
      type: "key.current",
      timestamp: Date.now(),
      duration_ms: 14,
      request: {},
      response: {
        data: {
          id: "key_123",
          prefix: "aistats_v1_sk_test",
          status: "active",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("key.current");
    expect(parsed.response?.data.id).toBe("key_123");
  });

  it("accepts organisations discovery entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_organisations_123",
      type: "organisations.list",
      timestamp: Date.now(),
      duration_ms: 21,
      request: {
        limit: 2,
        offset: 3,
      },
      response: {
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
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("organisations.list");
    expect(parsed.response?.organisations[0].organisation_id).toBe("org_123");
  });

  it("accepts pricing-model discovery entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_pricing_models_123",
      type: "pricing.models",
      timestamp: Date.now(),
      duration_ms: 23,
      request: {
        provider: "openai",
      },
      response: {
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
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("pricing.models");
    expect(parsed.response?.models[0].provider).toBe("openai");
  });

  it("accepts pricing calculation entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_pricing_calculate_123",
      type: "pricing.calculate",
      timestamp: Date.now(),
      duration_ms: 18,
      request: {
        provider: "openai",
        model: "openai/gpt-5-mini",
        endpoint: "responses",
        usage: {
          input_tokens: 1000,
        },
      },
      response: {
        ok: true,
        pricing: {
          total_cost_usd: 0.00025,
          currency: "USD",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("pricing.calculate");
    expect(parsed.response?.pricing.total_cost_usd).toBe(0.00025);
  });

  it("accepts provider and usage discovery entries", () => {
    const providers = DevToolsEntrySchema.parse({
      id: "entry_providers_123",
      type: "providers",
      timestamp: Date.now(),
      duration_ms: 15,
      request: {
        limit: 2,
      },
      response: {
        ok: true,
        providers: [
          {
            provider_id: "openai",
            name: "OpenAI",
          },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const credits = DevToolsEntrySchema.parse({
      id: "entry_credits_123",
      type: "credits",
      timestamp: Date.now(),
      duration_ms: 12,
      request: {
        team_id: "team_123",
      },
      response: {
        ok: true,
        credits: {
          balance_usd: 42.5,
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const activity = DevToolsEntrySchema.parse({
      id: "entry_activity_123",
      type: "activity",
      timestamp: Date.now(),
      duration_ms: 19,
      request: {
        days: 30,
      },
      response: {
        ok: true,
        total: 1,
        activity: [
          {
            request_id: "req_123",
            provider: "openai",
            model: "openai/gpt-5-mini",
          },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const analytics = DevToolsEntrySchema.parse({
      id: "entry_analytics_123",
      type: "analytics",
      timestamp: Date.now(),
      duration_ms: 18,
      request: {
        date: "2026-05-01",
      },
      response: {
        data: [
          {
            date: "2026-05-01",
            endpoint_id: "responses",
            requests: 12,
          },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(providers.type).toBe("providers");
    expect(credits.response?.credits.balance_usd).toBe(42.5);
    expect(activity.response?.activity[0].request_id).toBe("req_123");
    expect(analytics.response?.data[0].endpoint_id).toBe("responses");
  });

  it("accepts health entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_health_123",
      type: "health",
      timestamp: Date.now(),
      duration_ms: 8,
      request: {},
      response: {
        status: "ok",
        timestamp: "2026-05-05T12:00:00.000Z",
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("health");
    expect(parsed.response?.status).toBe("ok");
  });

  it("accepts model discovery entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_models_123",
      type: "models.list",
      timestamp: Date.now(),
      duration_ms: 19,
      request: {
        limit: 2,
        endpoints: "responses",
      },
      response: {
        ok: true,
        limit: 2,
        models: [
          {
            id: "openai/gpt-5-mini",
            endpoints: ["responses"],
          },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("models.list");
    expect(parsed.response?.models[0].id).toBe("openai/gpt-5-mini");
  });

  it("accepts api key listing entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_keys_123",
      type: "provisioning.keys.list",
      timestamp: Date.now(),
      duration_ms: 22,
      request: {
        disabled: true,
        limit: 2,
      },
      response: {
        object: "list",
        data: [
          { id: "key_123", status: "active" },
          { id: "key_456", status: "disabled" },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("provisioning.keys.list");
    expect(parsed.response?.data[1].status).toBe("disabled");
  });

  it("accepts api key retrieval entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_key_get_123",
      type: "provisioning.keys.get",
      timestamp: Date.now(),
      duration_ms: 17,
      request: {
        id: "key_123",
      },
      response: {
        data: {
          id: "key_123",
          hash: "keyhash_123",
          status: "active",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("provisioning.keys.get");
    expect(parsed.response?.data.hash).toBe("keyhash_123");
  });

  it("accepts api key mutation entries", () => {
    const created = DevToolsEntrySchema.parse({
      id: "entry_key_create_123",
      type: "provisioning.keys.create",
      timestamp: Date.now(),
      duration_ms: 18,
      request: {
        name: "Admin Key",
        scopes: ["gateway:read"],
      },
      response: {
        data: {
          id: "key_123",
          status: "active",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const updated = DevToolsEntrySchema.parse({
      id: "entry_key_update_123",
      type: "provisioning.keys.update",
      timestamp: Date.now(),
      duration_ms: 19,
      request: {
        id: "key_123",
        name: "Renamed Key",
        disabled: true,
      },
      response: {
        data: {
          id: "key_123",
          status: "disabled",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const deleted = DevToolsEntrySchema.parse({
      id: "entry_key_delete_123",
      type: "provisioning.keys.delete",
      timestamp: Date.now(),
      duration_ms: 16,
      request: {
        id: "key_123",
      },
      response: {
        data: {
          id: "key_123",
          deleted: true,
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(created.type).toBe("provisioning.keys.create");
    expect(updated.type).toBe("provisioning.keys.update");
    expect(deleted.type).toBe("provisioning.keys.delete");
    expect(deleted.response?.data.deleted).toBe(true);
  });

  it("accepts workspaces listing entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_workspaces_123",
      type: "provisioning.workspaces.list",
      timestamp: Date.now(),
      duration_ms: 19,
      request: {
        limit: 2,
        offset: 3,
      },
      response: {
        object: "list",
        data: [
          { id: "ws_123", slug: "default" },
          { id: "ws_456", slug: "sandbox" },
        ],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("provisioning.workspaces.list");
    expect(parsed.response?.data[1].slug).toBe("sandbox");
  });

  it("accepts workspace retrieval entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "entry_workspace_get_123",
      type: "provisioning.workspaces.get",
      timestamp: Date.now(),
      duration_ms: 16,
      request: {
        id: "ws_123",
      },
      response: {
        data: {
          id: "ws_123",
          slug: "default",
          name: "Default Workspace",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(parsed.type).toBe("provisioning.workspaces.get");
    expect(parsed.response?.data.name).toBe("Default Workspace");
  });

  it("accepts workspace mutation entries", () => {
    const created = DevToolsEntrySchema.parse({
      id: "entry_workspace_create_123",
      type: "provisioning.workspaces.create",
      timestamp: Date.now(),
      duration_ms: 21,
      request: {
        name: "Sandbox Workspace",
        slug: "sandbox",
      },
      response: {
        data: {
          id: "ws_123",
          slug: "sandbox",
          name: "Sandbox Workspace",
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const updated = DevToolsEntrySchema.parse({
      id: "entry_workspace_update_123",
      type: "provisioning.workspaces.update",
      timestamp: Date.now(),
      duration_ms: 18,
      request: {
        id: "ws_123",
        name: "Renamed Workspace",
        archived: true,
      },
      response: {
        data: {
          id: "ws_123",
          archived: true,
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    const deleted = DevToolsEntrySchema.parse({
      id: "entry_workspace_delete_123",
      type: "provisioning.workspaces.delete",
      timestamp: Date.now(),
      duration_ms: 14,
      request: {
        id: "ws_123",
      },
      response: {
        data: {
          id: "ws_123",
          deleted: true,
        },
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "2.0.3",
        stream: false,
        status_code: 200,
      },
    });

    expect(created.type).toBe("provisioning.workspaces.create");
    expect(updated.type).toBe("provisioning.workspaces.update");
    expect(deleted.type).toBe("provisioning.workspaces.delete");
    expect(deleted.response?.data.deleted).toBe(true);
  });

  it("accepts agent run entries", () => {
    const parsed = DevToolsEntrySchema.parse({
      id: "agent_run_123",
      type: "agent.run",
      timestamp: Date.now(),
      duration_ms: 45,
      request: {
        agent_id: "support-agent",
        input: "Summarize the ticket",
        model: "openai/gpt-5-mini",
        max_steps: 4,
        tool_count: 1,
      },
      response: {
        run: {
          id: "run_123",
          status: "completed",
        },
        output: "Done",
        steps: [],
        messages: [],
      },
      error: null,
      metadata: {
        sdk: "typescript",
        sdk_version: "0.1.0",
        stream: false,
        model: "openai/gpt-5-mini",
        provider: "openai",
        request_id: "req_123",
        native_response_id: "resp_123",
        agent_id: "support-agent",
        run_id: "run_123",
        run_status: "completed",
        step_count: 1,
        tool_count: 0,
      },
    });

    expect(parsed.type).toBe("agent.run");
    expect(parsed.metadata.agent_id).toBe("support-agent");
    expect(parsed.metadata.run_status).toBe("completed");
  });
});
