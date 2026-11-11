import { afterEach, expect, it, vi } from "vitest";
import { createJobObserver } from "./jobs";
import type { GatewayBindings } from "@/runtime/env";

afterEach(() => vi.unstubAllGlobals());
it("preserves handler failures, records skipped and completed jobs, and emits a heartbeat", async () => {
	const sent: Record<string, unknown>[] = [];
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json({}); }));
	const jobs = createJobObserver({ ENV: "staging", CF_VERSION_METADATA: { id: "fixture-version" }, PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==" } as GatewayBindings, 1234);
	const failure = new Error("private handler error", { cause: { code: "57014", details: "private database detail" } });
	await expect(jobs.run("broken", async () => { throw failure; })).rejects.toBe(failure);
	await jobs.run("disabled", async () => {}, false);
	await expect(jobs.run("working", async () => 42)).resolves.toBe(42);
	await jobs.flush();
	const body = JSON.stringify(sent);
	const records = JSON.parse(body)[0].resourceLogs[0].scopeLogs[0].logRecords.map((record: { body: { stringValue: string } }) => JSON.parse(record.body.stringValue));
	expect(records).toEqual(expect.arrayContaining([
		expect.objectContaining({ job: "broken", outcome: "error", actionable: true, error_name: "Error", error_code: "57014", release: "fixture-version" }),
		expect.objectContaining({ job: "disabled", outcome: "skipped", actionable: false }),
		expect.objectContaining({ job: "working", outcome: "completed", actionable: false }),
		expect.objectContaining({ event_name: "job.heartbeat", scheduled_at: 1234 }),
	]));
	expect(body).not.toContain('private handler error');
	expect(body).not.toContain('private database detail');
	expect(body).toContain('service.version');
});

it("keeps untrusted diagnostic fields out of job telemetry", async () => {
	const bodies: string[] = [];
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => { bodies.push(init.body); return Response.json({}); }));
	const jobs = createJobObserver({ ENV: "staging", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==" } as GatewayBindings, 1);
	const failure = new Error("customer message", { cause: { code: "customer content" } });
	await expect(jobs.run("fixture", async () => { throw failure; })).rejects.toBe(failure);
	await jobs.flush();
	expect(bodies.join()).not.toContain("customer");
	expect(bodies.join()).not.toContain("error_code");
});
