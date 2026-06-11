import {
	buildUsageDisplay,
	buildUsageFromNormalizedRequestFields,
	extractUsageMeters,
} from "./usageMeters";

describe("extractUsageMeters", () => {
	it("surfaces nested server tool usage counts", () => {
		const meters = extractUsageMeters({
			input_tokens: 120,
			output_tokens: 30,
			total_tokens: 150,
			server_tool_use: {
				datetime_requests: 1,
				web_search_requests: 2,
				web_search_results: 12,
				web_search_extra_results: 2,
				web_fetch_requests: 3,
				advisor_requests: 1,
				image_generation_requests: 1,
				apply_patch_requests: 1,
			},
		});

		expect(meters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "datetime_requests", value: 1, label: "Datetime tool requests" }),
				expect.objectContaining({ key: "web_search_requests", value: 2, label: "Web search requests" }),
				expect.objectContaining({ key: "web_search_results", value: 12, label: "Web search results" }),
				expect.objectContaining({ key: "web_search_extra_results", value: 2, label: "Web search extra results" }),
				expect.objectContaining({ key: "web_fetch_requests", value: 3, label: "Web fetch requests" }),
				expect.objectContaining({ key: "advisor_requests", value: 1, label: "Advisor requests" }),
				expect.objectContaining({ key: "image_generation_requests", value: 1, label: "Image generation requests" }),
				expect.objectContaining({ key: "apply_patch_requests", value: 1, label: "Apply patch requests" }),
			]),
		);
	});

	it("surfaces top-level search and citation observability counters", () => {
		const meters = extractUsageMeters({
			requested_native_web_search_tools: 1,
			output_web_search_result_count: 4,
			output_citation_count: 6,
		});

		expect(meters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "requested_native_web_search_tools",
					value: 1,
					label: "Requested native web search tools",
				}),
				expect.objectContaining({
					key: "output_web_search_result_count",
					value: 4,
					label: "Web search results",
				}),
				expect.objectContaining({
					key: "output_citation_count",
					value: 6,
					label: "Citations",
				}),
			]),
		);
	});
});

describe("buildUsageDisplay", () => {
	it("includes search observability meters in tooltips", () => {
		const display = buildUsageDisplay({
			input_tokens: 120,
			output_tokens: 30,
			total_tokens: 150,
			server_tool_use: {
				web_search_requests: 2,
			},
			output_citation_count: 4,
		});

		expect(display.tooltipLines).toEqual(
			expect.arrayContaining(["2 web search requests", "4 citations"]),
		);
	});
});

describe("buildUsageFromNormalizedRequestFields", () => {
	it("surfaces request-level modality and cache columns as usage meters", () => {
		const usage = buildUsageFromNormalizedRequestFields(
			{ input_tokens: 10, output_tokens: 5, total_tokens: 15 },
			{
				usage_input_tokens: 20,
				usage_output_tokens: 8,
				usage_total_tokens: 33,
				usage_reasoning_tokens: 5,
				usage_input_image_tokens: 12,
				usage_image_inputs: 2,
				usage_cached_read_tokens: 4,
				usage_cached_write_text_tokens_5m: 8,
				usage_cached_write_text_tokens_1h: 3,
				usage_image_megapixels: "1.5",
				usage_audio_seconds: "12.25",
			},
		);

		expect(extractUsageMeters(usage)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "input_tokens", value: 20 }),
				expect.objectContaining({ key: "output_tokens", value: 8 }),
				expect.objectContaining({ key: "total_tokens", value: 33 }),
				expect.objectContaining({ key: "reasoning_tokens", value: 5 }),
				expect.objectContaining({ key: "image_input_tokens", value: 12 }),
				expect.objectContaining({ key: "input_images", value: 2 }),
				expect.objectContaining({ key: "cache_read_tokens", value: 4 }),
				expect.objectContaining({ key: "cached_write_text_tokens_5m", value: 8 }),
				expect.objectContaining({ key: "cached_write_text_tokens_1h", value: 3 }),
				expect.objectContaining({ key: "image_megapixels", value: 1.5 }),
				expect.objectContaining({ key: "audio_seconds", value: 12.25 }),
			]),
		);
	});
});
