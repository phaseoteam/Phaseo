import { describe, expect, it } from "vitest";
import {
	buildPriceCardRows,
	describePriceCardRow,
	formatCardUsd,
	parsePriceMeterLabel,
	parsePriceValue,
	priceCardTokenUnits,
	type PriceCardLabels,
} from "./priceCardRows";

const labels: PriceCardLabels = {
	kinds: {
		input: "Input",
		output: "Output",
		reasoning: "Reasoning",
		cachedInput: "Cached input",
		cachedWrite: "Cached write",
		requests: "Requests",
		webSearch: "Web search",
		webFetch: "Web fetch",
		tokens: "Tokens",
	},
	modalities: { image: "image", video: "video", audio: "audio" },
	list: (items) => new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(items),
	also: (list) => `Also ${list}`,
	from: "From",
	atProviderCost: "At provider cost",
};

const describeAll = (rows: Array<[label: string, value: string]>) =>
	buildPriceCardRows(rows.map(([label, value], index) => ({ id: `row-${index}`, label, value })))
		.map((row) => describePriceCardRow(row, labels));

describe("parsePriceMeterLabel", () => {
	it.each([
		["Input Text Tokens", "input"],
		["Input Tokens", "input"],
		["Output Text Tokens", "output"],
		["Output Reasoning Tokens", "reasoning"],
		["Cached Read Text Tokens", "cachedInput"],
		["Cache Read Tokens", "cachedInput"],
		["Implicit Cached Input Text Tokens", "cachedInput"],
		["Cached Write Text Tokens 1h", "cachedWrite"],
		["Server Tool Web Search Requests", "webSearch"],
		["Native Web Fetch Requests", "webFetch"],
		["Requests", "requests"],
	])("maps %s to %s", (label, kind) => {
		expect(parsePriceMeterLabel(label).kind).toBe(kind);
	});

	it("reads the cache window from the meter key or a TTL note", () => {
		expect(parsePriceMeterLabel("Cached Write Text Tokens 1h").window).toBe("1h");
		expect(parsePriceMeterLabel("Cache Write Tokens (5 Min TTL)")).toMatchObject({ window: "5m", variant: null });
	});

	it("leaves text unlabelled", () => {
		expect(parsePriceMeterLabel("Input Text Tokens").modality).toBeNull();
		expect(parsePriceMeterLabel("Cached Read Text Tokens").modality).toBeNull();
	});

	it("names a modality only when the meter names one", () => {
		expect(parsePriceMeterLabel("Input Video Tokens").modality).toBe("video");
		expect(parsePriceMeterLabel("Output Image").modality).toBe("image");
		expect(parsePriceMeterLabel("Input Tokens").modality).toBeNull();
		expect(parsePriceMeterLabel("Output Tokens").modality).toBeNull();
	});

	it("keeps unknown meters under a sentence-case label", () => {
		expect(parsePriceMeterLabel("Image Pixels")).toMatchObject({ kind: null, fallbackLabel: "Image pixels" });
		expect(parsePriceMeterLabel("BFL Credits").fallbackLabel).toBe("BFL credits");
	});
});

describe("parsePriceValue", () => {
	it("reads amount, unit and From", () => {
		expect(parsePriceValue("$2 / 1M tokens")).toEqual({ from: false, amount: "$2", unit: "1M tokens" });
		expect(parsePriceValue("$2.50 /M tokens")).toEqual({ from: false, amount: "$2.50", unit: "1M tokens" });
		expect(parsePriceValue("From $0.04 / image")).toEqual({ from: true, amount: "$0.04", unit: "image" });
		expect(parsePriceValue("At provider cost")).toBeNull();
	});
});

describe("buildPriceCardRows", () => {
	it("labels rows briefly and states token units once", () => {
		expect(describeAll([
			["Input Text Tokens", "$2 / 1M tokens"],
			["Input Video Tokens", "$3 / 1M tokens"],
			["Output Reasoning Tokens", "$10 / 1M tokens"],
			["Cached Write Text Tokens 1h", "$4 / 1M tokens"],
		])).toEqual([
			{ key: "row-0", label: "Input", note: null, value: "$2" },
			{ key: "row-1", label: "Input · video", note: null, value: "$3" },
			{ key: "row-2", label: "Reasoning", note: null, value: "$10" },
			{ key: "row-3", label: "Cached write · 1h", note: null, value: "$4" },
		]);
	});

	it("merges same-priced modality variants into one row (Gemini: 7 rows to 4)", () => {
		const rows = describeAll([
			["Input Text Tokens", "$2 / 1M tokens"],
			["Output Text Tokens", "$12 / 1M tokens"],
			["Input Audio Tokens", "$4 / 1M tokens"],
			["Cached Read Text Tokens", "$0.20 / 1M tokens"],
			["Cached Read Image Tokens", "$0.20 / 1M tokens"],
			["Cached Read Video Tokens", "$0.20 / 1M tokens"],
			["Cached Read Audio Tokens", "$0.20 / 1M tokens"],
		]);
		expect(rows.map(({ label, note, value }) => ({ label, note, value }))).toEqual([
			{ label: "Input", note: null, value: "$2" },
			{ label: "Output", note: null, value: "$12" },
			{ label: "Input · audio", note: null, value: "$4" },
			{ label: "Cached input", note: "Also image, video and audio", value: "$0.20" },
		]);
	});

	it("names merged modalities in the label when no text meter is among them", () => {
		expect(describeAll([
			["Cached Read Image Tokens", "$0.10 / 1M tokens"],
			["Cached Read Video Tokens", "$0.10 / 1M tokens"],
		]).map((row) => row.label)).toEqual(["Cached input · image and video"]);
	});

	it("keeps differently priced variants separate", () => {
		expect(describeAll([
			["Cached Read Text Tokens", "$0.10 / 1M tokens"],
			["Cached Read Image Tokens", "$0.25 / 1M tokens"],
			["Cached Read Audio Tokens", "$0.10 / 1M tokens"],
		]).map(({ label, note, value }) => ({ label, note, value }))).toEqual([
			{ label: "Cached input", note: "Also audio", value: "$0.10" },
			{ label: "Cached input · image", note: null, value: "$0.25" },
		]);
	});

	it("does not merge different kinds, cache windows or variants", () => {
		expect(describeAll([
			["Cached Write Text Tokens 5m", "$1 / 1M tokens"],
			["Cached Write Text Tokens 1h", "$1 / 1M tokens"],
			["Input Text Tokens", "$1 / 1M tokens"],
			["Output Video (720p)", "$0.10 / sec"],
			["Output Video (1080p)", "$0.10 / sec"],
		]).map(({ label, note, value }) => ({ label, note, value }))).toEqual([
			{ label: "Cached write · 5m", note: null, value: "$1" },
			{ label: "Cached write · 1h", note: null, value: "$1" },
			{ label: "Input", note: null, value: "$1" },
			{ label: "Output · video", note: "720p", value: "$0.10 / sec" },
			{ label: "Output · video", note: "1080p", value: "$0.10 / sec" },
		]);
	});

	it("keeps non-token units on the row and localises provider-cost rows", () => {
		const rows = buildPriceCardRows([
			{ id: "a", label: "Input Text Tokens", value: "$2 / 1M tokens" },
			{ id: "b", label: "Output Image", value: "From $0.04 / image" },
			{ id: "c", label: "Deepinfra Cost Usd", value: "At provider cost" },
		]);
		expect(priceCardTokenUnits(rows)).toBe("some");
		expect(rows.map((row) => describePriceCardRow(row, { ...labels, from: "Ab", atProviderCost: "Zum Anbieterpreis" }).value))
			.toEqual(["$2", "Ab $0.04 / image", "Zum Anbieterpreis"]);
	});

	it("reports whether every priced row is per 1M tokens", () => {
		expect(priceCardTokenUnits(buildPriceCardRows([{ id: "a", label: "Input", value: "$1 / 1M tokens" }]))).toBe("all");
		expect(priceCardTokenUnits(buildPriceCardRows([{ id: "a", label: "Output Image", value: "$0.04 / image" }]))).toBe("none");
	});
});

describe("formatCardUsd", () => {
	it("formats US dollars and never rounds sub-cent prices up", () => {
		expect(formatCardUsd(2)).toBe("$2");
		expect(formatCardUsd(12.5)).toBe("$12.50");
		expect(formatCardUsd(0.0375)).toBe("$0.0375");
		expect(formatCardUsd(0.001239)).toBe("$0.001239");
		expect(formatCardUsd(0.0012399999)).toBe("$0.00123999");
		expect(formatCardUsd(0)).toBe("$0");
	});
});
