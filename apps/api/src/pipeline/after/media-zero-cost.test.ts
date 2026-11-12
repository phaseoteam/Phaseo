import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ emit: vi.fn(async () => undefined), dispatch: vi.fn() }));
vi.mock("@observability/axiom", () => ({ emitGatewayOperationalFailure: mocks.emit }));
vi.mock("@/runtime/env", () => ({ dispatchBackground: mocks.dispatch }));

import { alertUnexpectedZeroCostMedia } from "./media-zero-cost";

const paidCard = {
	provider: "spacex-ai", model: "x-ai/grok-imagine-image", endpoint: "image.generate",
	effective_from: null, effective_to: null, currency: "USD", version: null,
	rules: [{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: "0.02", currency: "USD", pricing_plan: "standard", note: null, match: [], priority: 100 }],
} as any;
const freeCard = { ...paidCard, rules: [{ ...paidCard.rules[0], price_per_unit: "0" }] };

function args(overrides: { capability?: string; keySource?: string; status?: number; totalNanos?: number; card?: any; testingMode?: boolean } = {}) {
	return {
		ctx: { requestId: "req_zero", workspaceId: "ws_1", capability: overrides.capability ?? "image.generate", model: "x-ai/grok-imagine-image", meta: {}, testingMode: overrides.testingMode } as any,
		result: { provider: "spacex-ai", apiModelId: "x-ai/grok-imagine-image", keySource: overrides.keySource ?? "gateway", upstream: new Response("{}", { status: overrides.status ?? 200 }), bill: { usage: { output_image: 1, requests: 1 } } } as any,
		card: "card" in overrides ? overrides.card : paidCard,
		totalNanos: overrides.totalNanos ?? 0,
	};
}

describe("synchronous media zero-cost alert", () => {
	beforeEach(() => {
		mocks.emit.mockClear();
		mocks.dispatch.mockClear();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	it.each(["image.generate", "image.edit", "audio.speech", "audio.transcription", "audio.translations", "music.generate", "ocr", "parse"])(
		"flags a successful %s call priced at $0 on a paid card",
		(capability) => {
			expect(alertUnexpectedZeroCostMedia(args({ capability }))).toBe(true);
			expect(mocks.emit).toHaveBeenCalledWith(expect.objectContaining({
				workflow: "media_finalization", workspaceId: "ws_1", resourceId: "req_zero", reason: "unexpected_zero_cost",
			}));
			expect(mocks.dispatch).toHaveBeenCalledTimes(1);
		},
	);

	it.each([
		["a priced call", { totalNanos: 20_000_000 }],
		["a BYOK call", { keySource: "byok" }],
		["a failed call", { status: 500 }],
		["a free card", { card: freeCard }],
		["no card", { card: null }],
		["chat", { capability: "text.generate" }],
		["video (finalised separately)", { capability: "video.generate" }],
		["internal testing", { testingMode: true }],
	])("does not flag %s", (_label, overrides) => {
		expect(alertUnexpectedZeroCostMedia(args(overrides as any))).toBe(false);
		expect(mocks.emit).not.toHaveBeenCalled();
	});

	it("never throws when the alert cannot be dispatched", () => {
		mocks.dispatch.mockImplementationOnce(() => { throw new Error("no runtime"); });
		expect(alertUnexpectedZeroCostMedia(args())).toBe(true);
	});
});
