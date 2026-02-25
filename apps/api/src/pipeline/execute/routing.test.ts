import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeProviders } from "./routing";

const readHealthManyMock = vi.fn();

vi.mock("./health", () => ({
	readHealthMany: (...args: any[]) => readHealthManyMock(...args),
}));

function health(provider: string) {
	return {
		endpoint: "responses",
		provider,
		model: "openai/gpt-4o-mini",
		lat_ewma_10s: 800,
		lat_ewma_60s: 800,
		lat_ewma_300s: 800,
		err_ewma_10s: 0,
		err_ewma_60s: 0,
		err_ewma_300s: 0,
		rate_10s: 0,
		rate_60s: 0,
		tp_ewma_60s: 1,
		rec_ok_ew_60s: 0,
		rec_tot_ew_60s: 0,
		inflight: 0,
		current_load: 0,
		breaker: "closed",
		breaker_until_ms: 0,
		breaker_attempts: 0,
		last_ts_10s: 0,
		last_ts_60s: 0,
		last_ts_300s: 0,
		last_updated: Date.now(),
	} as const;
}

function candidate(providerId: string, providerStatus: "active" | "beta") {
	return {
		providerId,
		providerStatus,
		adapter: { name: providerId } as any,
		baseWeight: 1,
		byokMeta: [],
		pricingCard: null,
		providerModelSlug: null,
	} as any;
}

describe("routeProviders testing mode", () => {
	beforeEach(() => {
		readHealthManyMock.mockReset();
		readHealthManyMock.mockImplementation(async (_endpoint: string, _model: string, providerIds: string[]) =>
			Object.fromEntries(providerIds.map((providerId) => [providerId, health(providerId)]))
		);
	});

	it("keeps beta providers gated on public traffic", async () => {
		const result = await routeProviders(
			[
				candidate("openai", "active"),
				candidate("google-ai-studio", "beta"),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				betaChannelEnabled: false,
				providerCapabilitiesBeta: false,
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		expect(result.diagnostics.testingMode).toBe(false);
		const statusStage = result.diagnostics.filterStages.find((stage) => stage.stage === "status_gate");
		expect(statusStage?.afterCount).toBe(1);
	});

	it("bypasses status gating when testing mode is enabled", async () => {
		const result = await routeProviders(
			[
				candidate("openai", "active"),
				candidate("google-ai-studio", "beta"),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				betaChannelEnabled: false,
				providerCapabilitiesBeta: false,
				testingMode: true,
			}
		);

		expect(result.ranked).toHaveLength(2);
		expect(result.diagnostics.testingMode).toBe(true);
		const statusStage = result.diagnostics.filterStages.find((stage) => stage.stage === "status_gate");
		expect(statusStage?.afterCount).toBe(2);
	});
});
