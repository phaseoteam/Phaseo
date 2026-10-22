import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import type { PriceCard } from "@pipeline/pricing/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const state = vi.hoisted(() => ({
	walletReserveCalls: [] as Array<Record<string, unknown>>,
	saveVideoJobMetaCalls: [] as Array<unknown[]>,
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.walletReserveCalls.push(args);
		return { status: "held", applied: true, alreadyApplied: false };
	}),
	releaseWalletReservation: vi.fn(async () => ({ status: "released", applied: true, alreadyApplied: false })),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: vi.fn(async (...args: unknown[]) => {
		state.saveVideoJobMetaCalls.push(args);
	}),
}));

// The sora-2 standard row: $0.10 per output second for the 720p sizes.
const SORA_2_CARD: PriceCard = {
	provider: "openai",
	model: "sora-2",
	endpoint: "video.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			pricing_plan: "standard",
			meter: "output_video_seconds",
			unit: "second",
			unit_size: 1,
			price_per_unit: "0.1",
			currency: "USD",
			match: [{ path: "video_params.resolution", op: "in", value: ["720x1280", "1280x720"] }],
			priority: 100,
		},
	] as any,
};

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_sora_defaults",
		workspaceId: "team_test",
		apiKeyId: "key_test",
		providerId: "openai",
		endpoint: "video.generation",
		protocol: "openai.video",
		capability: "video.generate",
		providerModelSlug: "sora-2",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: SORA_2_CARD,
		meta: {},
	} as unknown as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("openai video executor defaults", () => {
	beforeEach(() => {
		state.walletReserveCalls = [];
		state.saveVideoJobMetaCalls = [];
	});

	it("applies OpenAI's documented 4 second, 720x1280 defaults and reserves for them", async () => {
		let capturedBody: FormData | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/videos")) return false;
					capturedBody = init?.body as FormData;
					return true;
				},
				response: jsonResponse({ id: "vid_defaults", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({ model: "openai/sora-2", prompt: "A lighthouse at dusk" }));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.get("seconds")).toBe("4");
		expect(capturedBody?.get("size")).toBe("720x1280");
		// 4 s x $0.10 = $0.40 held before submission.
		expect(state.walletReserveCalls).toEqual([
			expect.objectContaining({ amountNanos: 400_000_000, reservationId: "video_hold:req_sora_defaults" }),
		]);
		// The stored job meta drives final billing when the poll omits seconds.
		const finalMeta = state.saveVideoJobMetaCalls.at(-1)?.[2] as Record<string, unknown>;
		expect(finalMeta).toMatchObject({ seconds: 4, resolution: "720x1280", reservedNanos: 400_000_000 });
	});

	it("keeps explicit seconds and size", async () => {
		let capturedBody: FormData | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/videos")) return false;
					capturedBody = init?.body as FormData;
					return true;
				},
				response: jsonResponse({ id: "vid_explicit", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({ model: "openai/sora-2", prompt: "A lighthouse", seconds: 8, size: "1280x720" }));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.get("seconds")).toBe("8");
		expect(capturedBody?.get("size")).toBe("1280x720");
		expect(state.walletReserveCalls).toEqual([expect.objectContaining({ amountNanos: 800_000_000 })]);
	});
});
