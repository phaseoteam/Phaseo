import { buildUsageDisplay, extractUsageMeters } from "./usageMeters";

describe("extractUsageMeters", () => {
	it("surfaces nested server tool usage counts", () => {
		const meters = extractUsageMeters({
			input_tokens: 120,
			output_tokens: 30,
			total_tokens: 150,
			server_tool_use: {
				datetime_requests: 1,
				web_search_requests: 2,
				web_fetch_requests: 3,
			},
		});

		expect(meters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "datetime_requests", value: 1, label: "Datetime tool requests" }),
				expect.objectContaining({ key: "web_search_requests", value: 2, label: "Web search requests" }),
				expect.objectContaining({ key: "web_fetch_requests", value: 3, label: "Web fetch requests" }),
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
