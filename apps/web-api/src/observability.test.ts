import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformObservability, recordSettingsFailure } from "./observability";
import type { Env } from "./env";

const env = { ENV: "staging", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==", PLATFORM_TRACE_SAMPLE_RATE: "1" } as Env;
afterEach(() => vi.unstubAllGlobals());
describe("web API observability", () => {
  it("correlates redacted handled failures with the request and sampled trace", async () => {
    const work: Promise<unknown>[] = [];
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(init.body); return Response.json({}); }));
    const app = new Hono<{ Bindings: Env }>();
    app.use("*", platformObservability);
    app.get("/settings/:id", c => {
      recordSettingsFailure(c, { code: "57014", message: "private query", details: "private customer", hint: "private token" }, "chat_policy_member_guardrails");
      return c.json({ error: "settings_unavailable" }, 503);
    });
    const response = await app.request("https://phaseo.app/settings/private-id?token=private", {}, { ...env, PUBLIC_RELEASE: "fixture-release" }, { waitUntil: promise => work.push(promise), passThroughOnException() {}, props: {} } as ExecutionContext);
    await Promise.all(work);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "settings_unavailable" });
    expect(sent).toHaveLength(2);
    expect(sent.join()).not.toContain("private");
    const log = JSON.parse(sent.find(body => body.includes('"resourceLogs"'))!);
    const event = JSON.parse(log.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue);
    expect(event).toMatchObject({ event_name: "web.request", route: "/settings/:id", status_code: 503, error_origin: "database", error_kind: "chat_policy_member_guardrails", error_code: "57014" });
    const resource = JSON.parse(sent.find(body => body.includes('"resourceSpans"'))!).resourceSpans[0];
    expect(resource.resource.attributes).toContainEqual({ key: "service.version", value: { stringValue: "fixture-release" } });
    const span = resource.scopeSpans[0].spans[0];
    expect(span.traceId).toBe(event.trace_id);
    expect(span.attributes).toContainEqual({ key: "phaseo.error_code", value: { stringValue: "57014" } });
    expect(span.attributes).toContainEqual({ key: "phaseo.error_kind", value: { stringValue: "chat_policy_member_guardrails" } });
  });
  it("propagates a child context and uses the route template without reading the streamed body", async () => {
    const work: Promise<unknown>[] = [];
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(init.body); return Response.json({}); }));
    let receivedHeader: string | undefined;
    const app = new Hono<{ Bindings: Env }>();
    app.use("*", platformObservability);
    app.get("/chat/:id", c => {
      receivedHeader = c.req.header("traceparent");
      return new Response("data: private\n\n", { headers: { "content-type": "text/event-stream" } });
    });
    const response = await app.request("https://phaseo.app/chat/private-identifier?token=private", { headers: { traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01` } }, env, { waitUntil: promise => work.push(promise), passThroughOnException() {}, props: {} } as ExecutionContext);
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe("data: private\n\n");
    await Promise.all(work);
    expect(receivedHeader).toMatch(/^00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-[a-f0-9]{16}-01$/);
    expect(JSON.stringify(sent)).not.toContain("private");
    const event = JSON.parse(JSON.parse(sent[0]).resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue);
    expect(event).toMatchObject({ route: "/chat/:id", outcome: "started", signal: "response_headers" });
  });
  it("fails open on export rejection and observes handled Hono exceptions as 500", async () => {
    const work: Promise<unknown>[] = [];
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(init.body); return new Response("secret remote body", { status: 503 }); }));
    const app = new Hono<{ Bindings: Env }>();
    app.use("*", platformObservability);
    const failure = new TypeError("private error", { cause: Object.assign(new Error("private upstream"), { code: "ECONNRESET" }) });
    failure.stack = "TypeError: private error\n    at handler (worker.js:12:3)";
    app.get("/error", () => { throw failure; });
    app.onError((_error, c) => c.json({ error: "unavailable" }, 500));
    const response = await app.request("https://phaseo.app/error", {}, env, { waitUntil: promise => work.push(promise), passThroughOnException() {}, props: {} } as ExecutionContext);
    await Promise.all(work);
    expect(response.status).toBe(500);
    expect(JSON.parse(JSON.parse(sent[0]).resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue)).toMatchObject({
      outcome: "error", error_name: "TypeError", error_code: "ECONNRESET", error_stack: "at worker.js:12:3",
    });
    expect(sent.join()).not.toContain("private error");
    expect(sent.join()).not.toContain("private upstream");
  });
});
