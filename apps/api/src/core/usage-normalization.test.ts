import { describe, expect, it } from "vitest";
import {
	resolveCanonicalTokenUsage,
	resolveRequestCountUsage,
} from "./usage-normalization";

describe("usage-normalization", () => {
	it("infers split tokens when provider returns total_tokens only", () => {
		const tokens = resolveCanonicalTokenUsage({ total_tokens: 42 });
		expect(tokens).toEqual({
			inputTokens: 42,
			outputTokens: 0,
			totalTokens: 42,
		});
	});

	it("fills missing output from total-input", () => {
		const tokens = resolveCanonicalTokenUsage({
			input_tokens: 11,
			total_tokens: 30,
		});
		expect(tokens).toEqual({
			inputTokens: 11,
			outputTokens: 19,
			totalTokens: 30,
		});
	});

	it("derives request count fallback from non-zero token usage", () => {
		expect(resolveRequestCountUsage({ total_tokens: 9 })).toBe(1);
		expect(resolveRequestCountUsage({ prompt_tokens: 0, completion_tokens: 0 })).toBe(
			undefined,
		);
		expect(resolveRequestCountUsage({ request_count: 7 })).toBe(7);
	});
});
