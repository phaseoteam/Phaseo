import { afterEach, expect, it, vi } from "vitest";
import { capturePlatformServerError } from "./grafana.server";

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("@/lib/start/wait-until", () => ({ waitUntil: (work: Promise<unknown>) => { pending.push(work); } }));

afterEach(() => { pending.length = 0; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reports a server error with its route template and trace, excluding request credentials and error content", async () => {
	vi.stubEnv("PHASEO_ENV", "production");
	vi.stubEnv("PUBLIC_RELEASE", "test-release");
	vi.stubEnv("PLATFORM_TELEMETRY_ENABLED", "true");
	vi.stubEnv("GRAFANA_OTLP_ENDPOINT", "https://otlp-gateway-prod-gb-south-1.grafana.net/otlp");
	vi.stubEnv("GRAFANA_OTLP_AUTHORIZATION", "Basic dGVzdA==");
	const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
	vi.stubGlobal("fetch", fetcher);
	const error = new Error("private customer message");
	error.stack = "Error: private customer message\n    at render (/src/private/route.ts:12:5)";
	capturePlatformServerError(error, new Request("https://phaseo.app/feedback/private-token?secret=private", {
		headers: { cookie: "private-cookie", authorization: "Bearer private-key", traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01` },
	}), { source: "render", routePath: "/feedback/$token" });
	await Promise.all(pending);
	expect(fetcher).toHaveBeenCalledTimes(1);
	const payload = String(fetcher.mock.calls[0][1]?.body);
	expect(payload).not.toContain("private");
	expect(payload).toContain('route.ts:12:5');
	const record = JSON.parse(payload).resourceLogs[0].scopeLogs[0].logRecords[0];
	expect(JSON.parse(payload).resourceLogs[0].resource.attributes).toContainEqual({ key: "service.version", value: { stringValue: "test-release" } });
	expect(JSON.parse(record.body.stringValue)).toMatchObject({ route: "/feedback/$token", trace_id: "a".repeat(32), outcome: "error" });
});

it("makes no request when disabled", async () => {
	vi.stubEnv("PLATFORM_TELEMETRY_ENABLED", "false");
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	capturePlatformServerError(new Error("private"), new Request("https://phaseo.app"), { source: "request" });
	await Promise.all(pending);
	expect(fetcher).not.toHaveBeenCalled();
});
