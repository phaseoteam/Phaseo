import { toPricingRuntimeStats } from "./pricingRuntimeStats";
import {
	getProviderRuntimeStats,
	providerRuntimeStatsKey,
	type ProviderRuntimeStats,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";

function stats(serviceTier = "standard"): ProviderRuntimeStats {
	const hours = Array.from({ length: 72 }, (_, hour) => ({
		start: new Date(Date.UTC(2026, 9, 8, hour)).toISOString(),
		uptimePct: hour % 2 ? 100 : null,
		requests: hour % 2 ? 10 : 0,
	}));
	return {
		providerId: "example", serviceTier, providerName: "Example",
		latencyMs30m: 250, throughput30m: 80, uptimePct3d: 99,
		inputTokens1h: 100, outputTokens1h: 200, cachedReadTokens1h: 30, cacheTokenPct1h: 30,
		uptimeDaily3d: [{ dayOffset: 0, uptimePct: 99, requests: 10, successful: 9 }],
		uptimeHourly3h: [{ hourOffset: 0, uptimePct: 99, requests: 10, successful: 9 }],
		uptimeHourly3d: hours.map((hour) => ({ ...hour, errorPct: 0, failed: 0, rateLimited: 0 })),
		performanceHourly3d: hours.map((hour) => ({ ...hour, latencyMs: 250, throughput: 80 })),
		requests30m: 10, requests3d: 720, successful3d: 710,
		healthRequests3d: 720, healthSuccessful3d: 710,
		failed3d: 5, neutral3d: 5, rateLimited3d: 2,
		latencyP50Ms3d: 250, latencyP95Ms3d: 500, avgGenerationMs3d: 1000,
		totalTokens3d: 10000, finishReasonCounts3d: { stop: 10 },
		errorCodeCounts3d: { "500": 5 }, errorCategoryCounts3d: { provider_error: 5 },
		lastRequestAt: "2026-10-11T14:00:00Z",
	};
}

it("retains every metric, inspector point and unknown observation without mutating the full fetch result", () => {
	const source = stats();
	const sourceJson = JSON.stringify(source);
	const key = providerRuntimeStatsKey("example");
	const projected = toPricingRuntimeStats({ [key]: source })[key];
	expect(projected).not.toHaveProperty("uptimeHourly3d");
	for (const key of Object.keys(source) as Array<keyof ProviderRuntimeStats>) {
		if (key !== "uptimeHourly3d") expect(projected[key]).toEqual(source[key]);
	}
	expect(projected.performanceHourly3d).toBe(source.performanceHourly3d);
	expect(projected.uptimeDaily3d).toBe(source.uptimeDaily3d);
	expect(projected.performanceHourly3d[0].uptimePct).toBeNull();
	expect(JSON.stringify(source)).toBe(sourceJson);
});

it("preserves independent normalized service tier lookup and missing provider behavior", () => {
	const standard = stats();
	const priority = { ...stats("priority"), throughput30m: 160 };
	const projected = toPricingRuntimeStats({
		[providerRuntimeStatsKey("example")]: standard,
		[providerRuntimeStatsKey("example", "priority")]: priority,
	});
	expect(getProviderRuntimeStats(projected, "example", "default")?.throughput30m).toBe(80);
	expect(getProviderRuntimeStats(projected, "example", "fast")?.throughput30m).toBe(160);
	expect(getProviderRuntimeStats(projected, "missing")).toBeUndefined();
	expect(toPricingRuntimeStats({})).toEqual({});
});

it("removes the duplicate 72-hour series from serialized props while retaining the full chart", () => {
	const full = { [providerRuntimeStatsKey("example")]: stats() };
	const projected = toPricingRuntimeStats(full);
	const fullBytes = Buffer.byteLength(JSON.stringify(full));
	const projectedBytes = Buffer.byteLength(JSON.stringify(projected));
	expect(projectedBytes).toBeLessThan(fullBytes * 0.65);
	expect(projected[providerRuntimeStatsKey("example")].performanceHourly3d).toHaveLength(72);
});
