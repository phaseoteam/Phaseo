import {
	buildChartShareFileName,
	buildChartShareUrl,
	displayChartPath,
	fromShareDate,
	readSharedChartState,
	toShareDate,
} from "./chartShare";

const modelTarget = {
	path: "/models/openai/gpt-6.1-terra",
	section: "pricing",
	chartId: "pricing-history",
	campaign: "model_chart" as const,
	state: { view: "effective", meter: "input_text_tokens", range: "90d", empty: null },
};

describe("chartShare", () => {
	it("keeps chart settings, tags the channel and anchors the section", () => {
		const url = new URL(buildChartShareUrl(modelTarget, "x"));
		expect(url.pathname).toBe("/models/openai/gpt-6.1-terra");
		expect(url.hash).toBe("#pricing");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			chart: "pricing-history",
			view: "effective",
			meter: "input_text_tokens",
			range: "90d",
			utm_source: "share",
			utm_medium: "x",
			utm_campaign: "model_chart",
			utm_content: "pricing-history",
		});
	});

	it("tags rankings charts with their own campaign", () => {
		const url = new URL(buildChartShareUrl({ path: "/rankings/image", section: "top-models", chartId: "top-models", campaign: "rankings_chart", state: { scale: "log" } }, "linkedin"));
		expect(url.pathname).toBe("/rankings/image");
		expect(url.searchParams.get("utm_campaign")).toBe("rankings_chart");
		expect(url.searchParams.get("utm_medium")).toBe("linkedin");
		expect(url.searchParams.get("scale")).toBe("log");
	});

	it("names the native share sheet channel distinctly", () => {
		expect(new URL(buildChartShareUrl(modelTarget, "native")).searchParams.get("utm_medium")).toBe("native_share");
	});

	it("restores settings only for the chart the link was shared from", () => {
		const search = new URL(buildChartShareUrl(modelTarget, "copy_link")).search;
		expect(readSharedChartState(search, "pricing-history")?.get("range")).toBe("90d");
		expect(readSharedChartState(search, "activity")).toBeNull();
	});

	it("builds a readable footer path and file name", () => {
		expect(displayChartPath(modelTarget.path)).toBe("phaseo.app/models/openai/gpt-6.1-terra");
		expect(buildChartShareFileName(modelTarget)).toBe("phaseo-models-openai-gpt-6.1-terra-pricing-history.png");
		expect(buildChartShareFileName({ path: "/rankings", chartId: "tool-calls" })).toBe("phaseo-rankings-tool-calls.png");
	});

	it("carries a custom date range through the link as calendar dates", () => {
		const from = new Date(2026, 9, 3);
		const to = new Date(2026, 10, 1);
		const link = buildChartShareUrl({ ...modelTarget, state: { from: toShareDate(from), to: toShareDate(to) } }, "copy_link");
		const shared = readSharedChartState(new URL(link).search, "pricing-history");
		expect(shared?.get("from")).toBe("2026-10-03");
		expect(fromShareDate(shared?.get("from") ?? null)?.getTime()).toBe(from.getTime());
		expect(fromShareDate(shared?.get("to") ?? null)?.getTime()).toBe(to.getTime());
		expect(fromShareDate("03/10/2026")).toBeUndefined();
	});
});
