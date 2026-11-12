import { afterEach, expect, it, vi } from "vitest";
import worker from "./index";
import type { GatewayBindings } from "@/runtime/env";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

vi.mock("@/routes/v1", async () => {
  const { Hono } = await import("hono");
  const router = new Hono();
  router.get("/fixture/:id", () => {
    const error = new TypeError("sentinel-private-message", { cause: { code: "57014", details: "sentinel-private-sql" } });
    error.stack = "TypeError: sentinel-private-message\n    at handler (worker.js:12:4)";
    throw error;
  });
  return { v1Router: router };
});
vi.mock("@/regional-surface", () => ({ enforceRegionalSurface: async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("@/observability/axiom", () => ({ sendAxiomWideEvent: async () => {} }));

afterEach(() => vi.restoreAllMocks());

it("returns the existing gateway failure response while exporting private diagnostics and its request ID", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const sent: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    sent.push(String(init?.body)); return Response.json({});
  });
  const pending: Promise<unknown>[] = [];
  const env = {
    ENV: "staging", PLATFORM_TELEMETRY_ENABLED: "true",
    GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp",
    GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==", CF_VERSION_METADATA: { id: "fixture-release" },
  } as GatewayBindings;
  const response = await worker.fetch(new Request("https://api.phaseo.app/v1/fixture/sentinel-private-id?token=sentinel-private-query"), env,
    { waitUntil: promise => pending.push(promise), passThroughOnException() {}, props: {} } as ExecutionContext);
  await Promise.all(pending);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("sentinel-private");
  expect(sent).toHaveLength(1);
  expect(sent.join()).not.toContain("sentinel-private");
  const record = JSON.parse(JSON.parse(sent[0]!).resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue);
  expect(record).toMatchObject({ event_name: "gateway.unhandled_error", error_name: "TypeError", error_code: "57014",
    error_stack: "at worker.js:12:4", release: "fixture-release", route: "/v1/fixture/:id", request_id: response.headers.get("x-request-id") });
});
