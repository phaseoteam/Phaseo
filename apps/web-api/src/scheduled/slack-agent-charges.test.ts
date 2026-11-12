import { afterEach, expect, it, vi } from "vitest";
import { handleSlackAgentChargesScheduledEvent } from "./slack-agent-charges";
import type { Env } from "@/env";

const charge = vi.hoisted(() => vi.fn());
vi.mock("@/billing/slackAgentCharges", () => ({ chargeSlackAgentMonths: charge }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({}) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("reports returned charge failures without exporting billing amounts or changing the job result", async () => {
	charge.mockResolvedValue({ due: 2, failed: 1, chargedNanos: 123456789 });
	const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("unavailable", { status: 503 }));
	vi.stubGlobal("fetch", fetcher);
	const event = { scheduledTime: Date.UTC(2026, 10, 6, 1, 17) } as ScheduledController;
	await expect(handleSlackAgentChargesScheduledEvent(event, { ENV: "production", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-gb-south-1.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==" } as Env)).resolves.toBeUndefined();
	const payload = String(fetcher.mock.calls[0][1]?.body);
	expect(payload).not.toContain("123456789");
	expect(JSON.parse(JSON.parse(payload).resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue)).toMatchObject({ job: "slack_agent_charges", outcome: "error", failed_count: 1 });
});
