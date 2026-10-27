import { describe, expect, it } from "vitest";
import { chartAltText, chartFilename, chartSvg, DRAWABLE_RANGES, formatValue, makeChartTool, niceScale, parseChartSpec, SERIES_COLOURS } from "../src/chart";
import { renderPng } from "../src/chart-png";

const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } })
	.process.getBuiltinModule("node:fs") as { readFileSync(path: URL): Uint8Array };

const spend = { type: "bar", title: "Weekly spend", labels: ["Oct 5", "Oct 12"], series: [{ name: "OpenAI", values: [12.5, 40] }, { name: "Anthropic", values: [8, 22] }], value_prefix: "$" };

/** The code points a TrueType font maps (its cmap's format 4 subtable). */
function fontCodePoints(path: string): Set<number> {
	const bytes = readFileSync(new URL(path, (import.meta as unknown as { url: string }).url));
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tables = view.getUint16(4);
	let cmap = 0;
	for (let index = 0; index < tables; index += 1) {
		const tag = String.fromCharCode(...bytes.subarray(12 + index * 16, 16 + index * 16));
		if (tag === "cmap") cmap = view.getUint32(12 + index * 16 + 8);
	}
	const codes = new Set<number>();
	for (let index = 0; index < view.getUint16(cmap + 2); index += 1) {
		const table = cmap + view.getUint32(cmap + 8 + index * 8);
		if (view.getUint16(table) !== 4) continue;
		const segments = view.getUint16(table + 6) / 2;
		const ends = table + 14;
		const starts = ends + segments * 2 + 2;
		const deltas = starts + segments * 2;
		const offsets = deltas + segments * 2;
		for (let segment = 0; segment < segments; segment += 1) {
			const start = view.getUint16(starts + segment * 2);
			const end = view.getUint16(ends + segment * 2);
			const delta = view.getInt16(deltas + segment * 2);
			const offset = view.getUint16(offsets + segment * 2);
			for (let code = start; code <= end && code !== 0xffff; code += 1) {
				const glyph = offset === 0 ? (code + delta) & 0xffff : view.getUint16(offsets + segment * 2 + offset + (code - start) * 2);
				if (glyph) codes.add(code);
			}
		}
	}
	return codes;
}

describe("chart specs", () => {
	it("takes bar, line and pie charts, with optional axis labels and units", () => {
		expect(parseChartSpec({ ...spend, x_label: "Week", y_label: "Spend (USD)" })).toEqual({
			type: "bar", title: "Weekly spend", labels: ["Oct 5", "Oct 12"],
			series: [{ name: "OpenAI", values: [12.5, 40] }, { name: "Anthropic", values: [8, 22] }],
			xLabel: "Week", yLabel: "Spend (USD)", valuePrefix: "$", valueSuffix: "",
		});
		// A unit keeps one space when it had one, and a lone series without a name takes the title.
		expect(parseChartSpec({ type: "line", title: "Latency", labels: ["Mon"], series: [{ values: [820] }], value_suffix: " ms" })).toMatchObject({ series: [{ name: "Latency", values: [820] }], valueSuffix: " ms" });
		expect(parseChartSpec({ type: "pie", title: "Share", labels: ["A", "B"], series: [{ name: "Share", values: [3, 1] }], x_label: "ignored" })).toMatchObject({ xLabel: null });
	});

	it("tells the model what to fix", () => {
		const cases: Array<[unknown, RegExp]> = [
			[{ ...spend, type: "radar" }, /type must be one of bar, line, pie/],
			[{ ...spend, title: "" }, /title is required/],
			[{ ...spend, title: "x".repeat(81) }, /title must be at most 80 characters/],
			[{ ...spend, labels: Array.from({ length: 25 }, (_, index) => `W${index}`) }, /a bar chart takes at most 24 labels/],
			[{ ...spend, series: [{ name: "OpenAI", values: [1] }] }, /one number for each of the 2 labels/],
			[{ ...spend, series: [{ name: "OpenAI", values: [1, Number.NaN] }] }, /values\[1\] must be a number/],
			[{ ...spend, series: Array.from({ length: 7 }, (_, index) => ({ name: `S${index}`, values: [1, 2] })) }, /at most 6 series/],
			[{ type: "pie", title: "One", labels: ["A"], series: [{ name: "A", values: [1] }] }, /at least 2 slices/],
			[{ type: "pie", title: "Share", labels: ["A", "B"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [1, 2] }] }, /exactly one series/],
			[{ type: "pie", title: "Share", labels: ["A", "B"], series: [{ name: "A", values: [0, 0] }] }, /a slice above zero/],
			[{ ...spend, title: "週ごとの支出" }, /characters the chart font can't draw/],
			[{ ...spend, value_prefix: "dollars" }, /value_prefix must be at most 6 characters/],
		];
		for (const [input, message] of cases) expect(() => parseChartSpec(input), message.source).toThrow(message);
	});

	it("only allows characters both bundled fonts draw", () => {
		for (const font of ["../assets/Montserrat-Regular.ttf", "../assets/Montserrat-SemiBold.ttf"]) {
			const codes = fontCodePoints(font);
			for (const [start, end] of DRAWABLE_RANGES) {
				for (let code = start; code <= end; code += 1) expect(codes.has(code), `${font} draws U+${code.toString(16).toUpperCase()}`).toBe(true);
			}
		}
		expect(() => parseChartSpec({ ...spend, title: "Café spend: Тест – 2026 ≤ €40" })).not.toThrow();
	});
});

describe("drawing charts", () => {
	it("puts the value axis on round steps from zero", () => {
		expect(niceScale([12.5, 40, 8, 22])).toEqual({ min: 0, max: 40, step: 10, decimals: 0 });
		expect(niceScale([0.3, 1.1])).toEqual({ min: 0, max: 1.25, step: 0.25, decimals: 2 });
		expect(niceScale([-50, 1150])).toEqual({ min: -250, max: 1250, step: 250, decimals: 0 });
		expect(niceScale([0, 0])).toMatchObject({ min: 0, max: 1 });
	});

	it("prints values with their units, large ones compactly", () => {
		const money = { valuePrefix: "$", valueSuffix: "" };
		expect(formatValue(1250.5, money)).toBe("$1,250.5");
		expect(formatValue(-3, money)).toBe("−$3");
		expect(formatValue(3_400_000, money)).toBe("$3.4M");
		expect(formatValue(12.5, { valuePrefix: "", valueSuffix: "%" })).toBe("12.5%");
	});

	it("draws the title, a legend for two or more series, series colours in order, and escapes text", () => {
		const svg = chartSvg(parseChartSpec({ ...spend, title: "Spend <&> \"tests\"" }));
		expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"750\"")).toBe(true);
		expect(svg).toContain("Spend &lt;&amp;&gt; &quot;tests&quot;");
		expect(svg).not.toContain("<&>");
		expect(svg.indexOf(SERIES_COLOURS[0])).toBeLessThan(svg.indexOf(SERIES_COLOURS[1]));
		expect(svg).toContain(">OpenAI</text>");
		expect(svg).toContain(">Anthropic</text>");
		// One series: no legend, the title names it.
		const single = chartSvg(parseChartSpec({ ...spend, series: [spend.series[0]] }));
		expect(single).not.toContain(">OpenAI</text>");
		expect(single).not.toContain(SERIES_COLOURS[1]);
	});

	it("names each pie slice with its share and value beside the pie", () => {
		const svg = chartSvg(parseChartSpec({ type: "pie", title: "By provider", labels: ["OpenAI", "Anthropic"], series: [{ name: "Spend", values: [300, 100] }], value_prefix: "$" }));
		expect(svg).toContain(">75% · $300</text>");
		expect(svg).toContain(">25% · $100</text>");
	});

	it("renders a PNG of the chart with the bundled fonts", async () => {
		const png = await renderPng(chartSvg(parseChartSpec(spend)));
		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
		expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 750]);
		expect(png.byteLength).toBeLessThan(500_000);
	});

	it("describes the chart for screen readers, and names its file after the title", () => {
		expect(chartAltText(parseChartSpec(spend))).toBe("Bar chart: Weekly spend. OpenAI: Oct 5 $12.5, Oct 12 $40; Anthropic: Oct 5 $8, Oct 12 $22.");
		expect(chartAltText(parseChartSpec({ ...spend, labels: Array.from({ length: 24 }, (_, index) => `Week number ${index}`), series: [{ name: "A very long series name", values: Array.from({ length: 24 }, () => 123_456) }] })).length).toBeLessThanOrEqual(1_000);
		expect(chartFilename("Weekly spend: Oct 2026!")).toBe("weekly-spend-oct-2026.png");
		expect(chartFilename("Тест")).toBe("chart.png");
	});
});

describe("the make_chart tool", () => {
	it("posts the rendered chart and notes it, or says Slack didn't take it", async () => {
		const posted: Array<{ filename: string; title: string; altText: string; bytes: Uint8Array }> = [];
		const notes: string[] = [];
		const bytes = new Uint8Array([1, 2, 3]);
		let ok = true;
		const tool = makeChartTool({
			render: async (svg) => {
				expect(svg).toContain("Weekly spend");
				return bytes;
			},
			post: async (file) => {
				posted.push(file);
				return ok ? { ok: true, fileId: "F0CHART001" } : { ok: false, error: "not_in_channel" };
			},
			notes,
		});
		const execute = tool.execute as (input: unknown) => Promise<unknown>;
		await expect(execute(spend)).resolves.toEqual({ posted: true, file: "weekly-spend.png" });
		expect(posted).toEqual([{ filename: "weekly-spend.png", title: "Weekly spend", altText: chartAltText(parseChartSpec(spend)), bytes }]);
		expect(notes).toEqual(['make_chart: posted a bar chart, "Weekly spend"']);
		ok = false;
		await expect(execute(spend)).resolves.toEqual({ posted: false, error: "Slack didn't take the chart just now. Give the numbers in your reply instead." });
		expect(notes).toHaveLength(1);
		expect(tool.onError).toBe("return-to-model");
	});
});
