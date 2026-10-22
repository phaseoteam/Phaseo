import { describe, expect, it } from "vitest";
import {
	mergeStreamUsage,
	resolveCanonicalTokenUsage,
	resolveRequestCountUsage,
} from "./usage-normalization";

describe("mergeStreamUsage", () => {
	const start = {
		input_tokens: 30,
		cache_read_input_tokens: 4,
		cache_creation_input_tokens: 2,
		cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2 },
		output_tokens: 1,
	};

	it("keeps counts a later event omits and takes the later output", () => {
		expect(mergeStreamUsage(start, { output_tokens: 9 })).toEqual({ ...start, output_tokens: 9 });
	});

	it("does not let a later 0 erase a count already reported, nested counts included", () => {
		expect(mergeStreamUsage(start, {
			input_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
			cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
			output_tokens: 9,
			server_tool_use: { web_search_requests: 1 },
		})).toEqual({ ...start, output_tokens: 9, server_tool_use: { web_search_requests: 1 } });
	});

	it("takes later non-zero counts, including one that fills an earlier 0", () => {
		expect(mergeStreamUsage({ input_tokens: 0, output_tokens: 0 }, { input_tokens: 12, output_tokens: 3 }))
			.toEqual({ input_tokens: 12, output_tokens: 3 });
		expect(mergeStreamUsage({ input_tokens: 40 }, { input_tokens: 35 })).toEqual({ input_tokens: 35 });
	});

	it("returns whichever side is a usage object when the other is not", () => {
		expect(mergeStreamUsage(null, { output_tokens: 1 })).toEqual({ output_tokens: 1 });
		expect(mergeStreamUsage({ output_tokens: 1 }, null)).toEqual({ output_tokens: 1 });
	});
});

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
