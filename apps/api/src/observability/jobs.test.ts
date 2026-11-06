import { afterEach, expect, it, vi } from "vitest";
import { createJobObserver } from "./jobs";
import type { GatewayBindings } from "@/runtime/env";

afterEach(() => vi.unstubAllGlobals());
it("preserves handler failures, records skipped and completed jobs, and emits a heartbeat", async () => {
	const sent: Record<string, unknown>[] = [];
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json({}); }));
	const jobs = createJobObserver({ ENV: "staging", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==" } as GatewayBindings, 1234);
	const failure = new Error("private handler error");
	await expect(jobs.run("broken", async () => { throw failure; })).rejects.toBe(failure);
	await jobs.run("disabled", async () => {}, false);
	await expect(jobs.run("working", async () => 42)).resolves.toBe(42);
	await jobs.flush();
	const body = JSON.stringify(sent);
	const records = JSON.parse(body)[0].resourceLogs[0].scopeLogs[0].logRecords.map((record: { body: { stringValue: string } }) => JSON.parse(record.body.stringValue));
	expect(records).toEqual(expect.arrayContaining([
		expect.objectContaining({ job: "broken", outcome: "error", actionable: true }),
		expect.objectContaining({ job: "disabled", outcome: "skipped", actionable: false }),
		expect.objectContaining({ job: "working", outcome: "completed", actionable: false }),
		expect.objectContaining({ event_name: "job.heartbeat", scheduled_at: 1234 }),
	]));
	expect(body).not.toContain('private handler error');
});
