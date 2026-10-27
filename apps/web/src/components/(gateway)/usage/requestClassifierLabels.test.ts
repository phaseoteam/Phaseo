import { buildLabelKeyOptions, formatUsd, labelValueDisplay, type RequestClassifierSummary } from "./requestClassifierLabels";

const classifiers: RequestClassifierSummary[] = [
	{ id: "c1", name: "Department", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal", "sales", "other"] }] },
	// A later classifier with the same key does not own it, as in the gateway.
	{ id: "c2", name: "Intent", enabled: true, dimensions: [{ key: "intent", name: "Intent", multiple: true, values: ["draft"] }, { key: "department", name: "Team", multiple: false, values: ["ops"] }] },
];

describe("buildLabelKeyOptions", () => {
	it("lists classifier dimensions first with their allowed values, then classifier calls, then caller keys", () => {
		const options = buildLabelKeyOptions([
			{ key: "department", value: "sales" },
			{ key: "env", value: "prod" },
			{ key: "app", value: "web" },
			{ key: "phaseo.classifier", value: "c1" },
			{ key: "phaseo.classifier", value: "deleted" },
		], classifiers);
		expect(options.map((option) => [option.key, option.kind, option.name])).toEqual([
			["department", "classifier", "Department"],
			["intent", "classifier", "Intent"],
			["phaseo.classifier", "classifier_calls", null],
			["app", "caller", null],
			["env", "caller", null],
		]);
		// Values seen in the range come first; allowed values show even before anyone uses them.
		expect(options[0].values).toEqual([
			{ value: "sales", label: "sales", seen: true },
			{ value: "legal", label: "legal", seen: false },
			{ value: "other", label: "other", seen: false },
		]);
		expect(options[0].classifierName).toBe("Department");
		expect(options[2].values).toEqual([
			{ value: "c1", label: "Department", seen: true },
			{ value: "deleted", label: "deleted", seen: true },
			{ value: "c2", label: "Intent", seen: false },
		]);
	});

	it("offers classifier dimensions with no traffic and nothing for a workspace without labels", () => {
		expect(buildLabelKeyOptions([], classifiers).map((option) => option.key)).toEqual(["department", "intent", "phaseo.classifier"]);
		expect(buildLabelKeyOptions([], [])).toEqual([]);
	});
});

describe("labelValueDisplay", () => {
	it("names classifier calls and leaves other values alone", () => {
		expect(labelValueDisplay("phaseo.classifier", "c2", classifiers)).toBe("Intent");
		expect(labelValueDisplay("phaseo.classifier", "gone", classifiers)).toBe("gone");
		expect(labelValueDisplay("department", "c2", classifiers)).toBe("c2");
	});
});

describe("formatUsd", () => {
	it("formats money as US dollars with small amounts kept visible", () => {
		expect(formatUsd(12_500_000_000)).toBe("$12.50");
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(42_000)).toBe("$0.000042");
		expect(formatUsd(1_234_567)).toBe("$0.0012");
	});
});
