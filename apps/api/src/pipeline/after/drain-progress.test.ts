import { describe, expect, it } from "vitest";
import { estimateDrainProgressUsage } from "./drain-progress";

describe("estimateDrainProgressUsage", () => {
	it("counts only the streamed output until the provider reports input", () => {
		// A long (possibly cached) prompt is not estimated: it would be priced at the full input rate.
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 1_000 }))
			.toEqual({ usage: { input_tokens: 0, output_tokens: 200 }, inputReported: false });
		expect(estimateDrainProgressUsage({ usage: { output_tokens: 3 }, outputChars: 1_000 }))
			.toEqual({ usage: { input_tokens: 0, output_tokens: 200 }, inputReported: false });
	});

	it("keeps reported input and cache counts and never lowers reported output", () => {
		const usage = { input_tokens: 40, cache_read_input_tokens: 900, output_tokens: 300 };
		expect(estimateDrainProgressUsage({ usage, outputChars: 500 }))
			.toEqual({ usage: { ...usage, output_tokens: 300 }, inputReported: true });
		expect(estimateDrainProgressUsage({ usage: { prompt_tokens: 40 }, outputChars: 500 }))
			.toEqual({ usage: { prompt_tokens: 40, completion_tokens: 100 }, inputReported: true });
	});

	it("returns nothing when there is nothing to charge", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 0 })).toBeNull();
	});
});
