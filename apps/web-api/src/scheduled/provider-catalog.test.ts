import { afterEach, expect, it, vi } from "vitest";
import { handleProviderCatalogScheduledEvent } from "./provider-catalog";
import type { Env } from "@/env";

const polling = vi.hoisted(() => vi.fn());
vi.mock("@/routes/account/provider-catalog-sync", () => ({ activateDueProviderCatalogReleases: async () => 2, runProviderCatalogPollingJob: polling }));
vi.mock("@/lib/provider-model-notifications", () => ({ notifyPendingProviderModels: async () => {} }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(["reported", "thrown"])("reports %s polling failures without changing scheduled error handling", async mode => {
	if (mode === "reported") polling.mockResolvedValue({ failed: 1 });
	else polling.mockRejectedValue(new Error("private provider response"));
	const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
	vi.stubGlobal("fetch", fetcher);
	await expect(handleProviderCatalogScheduledEvent({ scheduledTime: 1234 } as ScheduledController, {
		ENV: "production", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-gb-south-1.grafana.net/otlp", GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==",
	} as Env, {} as ExecutionContext)).resolves.toBeUndefined();
	const payload = String(fetcher.mock.calls[0][1]?.body);
	expect(payload).not.toContain("private");
	expect(JSON.parse(JSON.parse(payload).resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue)).toMatchObject({ job: "provider_catalog_poll", outcome: "error", failed_count: 1 });
});
