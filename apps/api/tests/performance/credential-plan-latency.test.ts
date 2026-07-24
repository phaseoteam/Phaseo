import { describe, expect, it } from "vitest";
import { buildCredentialAttemptPlan } from "@/pipeline/execute";

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((left, right) => left - right);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

function rankedProviders(count: number) {
	return Array.from({ length: count }, (_, providerIndex) => ({
		candidate: {
			providerId: `provider-${providerIndex}`,
			byokMeta: [
				{
					id: `priority-${providerIndex}`,
					providerId: `provider-${providerIndex}`,
					fingerprintSha256: `priority-${providerIndex}`,
					keyVersion: "1",
					alwaysUse: true,
					routingMode: "priority" as const,
					sortOrder: 0,
					key: "secret",
				},
				{
					id: `fallback-${providerIndex}`,
					providerId: `provider-${providerIndex}`,
					fingerprintSha256: `fallback-${providerIndex}`,
					keyVersion: "1",
					alwaysUse: false,
					routingMode: "fallback" as const,
					sortOrder: 0,
					key: "secret",
				},
			],
		},
	}));
}

describe.skipIf(process.env.RUN_ROUTING_PERF !== "1")(
	"credential fallback-plan latency",
	() => {
		it.each([4, 16, 64])(
			"builds a %i-provider priority/managed/fallback plan under 0.5ms p95",
			(providerCount) => {
				const ranked = rankedProviders(providerCount);
				for (let index = 0; index < 100; index += 1) {
					buildCredentialAttemptPlan(ranked);
				}

				const samples: number[] = [];
				const iterations = 1_000;
				for (let index = 0; index < iterations; index += 1) {
					const started = performance.now();
					const plan = buildCredentialAttemptPlan(ranked);
					samples.push(performance.now() - started);
					expect(plan).toHaveLength(providerCount * 3);
				}

				const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
				const p50 = percentile(samples, 50);
				const p95 = percentile(samples, 95);
				const p99 = percentile(samples, 99);
				console.log(
					`[perf][credential-plan] providers=${providerCount} attempts=${providerCount * 3} iterations=${iterations} avg=${average.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
				);
				expect(p95).toBeLessThan(0.5);
			},
		);
	},
);
