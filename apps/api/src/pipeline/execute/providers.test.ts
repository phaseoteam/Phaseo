import { beforeEach, describe, expect, it, vi } from "vitest";
import { rankProviders } from "./providers";

const routeProvidersMock = vi.fn();

vi.mock("./routing", () => ({
	routeProviders: (...args: unknown[]) => routeProvidersMock(...args),
}));

describe("rankProviders", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defers score tracing until diagnostics are consumed and preserves the persisted snapshot", async () => {
		const candidate = {
			providerId: "example",
			providerModelSlug: "model",
		};
		const scoreTrace = {
			calculation: {
				formula: "balanced_weighted_additive",
				baseScore: 0.75,
				finalScore: 0.75,
			},
		};
        const readTrace = vi.fn(() => scoreTrace);
		routeProvidersMock.mockResolvedValue({
			ranked: [{
				candidate,
				adapter: { name: "Example" },
				health: { breaker: "closed", breaker_until_ms: null },
				score: 0.75,
				scoreFactorValues: [1, 0.5],
				get scoreTrace() { return readTrace(); },
			}],
			diagnostics: {},
		});
		const ctx = {
			endpoint: "chat.completions",
			model: "example/model",
			workspaceId: "workspace",
			body: {},
			meta: {},
			teamSettings: {},
		};

		await rankProviders([candidate] as any, ctx as any);
        expect(readTrace).not.toHaveBeenCalled();
		expect(JSON.parse(JSON.stringify((ctx as any).routingSnapshot))).toEqual([
			expect.objectContaining({ score_trace: scoreTrace }),
		]);
        expect(readTrace).toHaveBeenCalledTimes(1);
	});
});
