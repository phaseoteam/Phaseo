import {
	defaultRequestColumns,
	formatRequestMetric,
	normalizeRequestColumns,
	normalizeRequestDensity,
} from "./requestColumns";

describe("request column preferences", () => {
	it("groups pinned columns on the left, retains their order, and ignores invalid pin values", () => {
		const columns = normalizeRequestColumns([
			{ id: "cost", visible: true },
			{ id: "models", visible: true, pinned: true },
			{ id: "date", visible: false, pinned: true },
			{ id: "provider", visible: true, pinned: "true" },
		]);
		expect(columns.slice(0, 4)).toEqual([
			{ id: "models", visible: true, pinned: true },
			{ id: "date", visible: false, pinned: true },
			{ id: "cost", visible: true },
			{ id: "provider", visible: true },
		]);
		expect(columns.filter(({ visible }) => visible)[0].id).toBe("models");
	});
	it.each([null, undefined, "invalid", {}, "regular"])(
		"defaults invalid density to regular: %s",
		(value) => {
			expect(normalizeRequestDensity(value)).toBe("regular");
		},
	);
	it.each(["compact", "expanded"])("preserves density %s", (value) => {
		expect(normalizeRequestDensity(value)).toBe(value);
	});
	it("preserves saved order and visibility, removes invalid entries, and adds new columns", () => {
		const columns = normalizeRequestColumns([
			{ id: "overhead", visible: true },
			{ id: "date", visible: false },
			{ id: "date", visible: true },
			{ id: "unknown", visible: true },
			null,
		]);
		expect(columns.slice(0, 2)).toEqual([
			{ id: "overhead", visible: true },
			{ id: "date", visible: false },
		]);
		expect(columns).toHaveLength(12);
		expect(new Set(columns.map(({ id }) => id)).size).toBe(12);
	});
	it("recovers corrupt preferences and retains at least one visible column", () => {
		expect(normalizeRequestColumns({})).toEqual(defaultRequestColumns());
		expect(
			normalizeRequestColumns(
				defaultRequestColumns().map((column) => ({
					...column,
					visible: false,
				})),
			).filter(({ visible }) => visible),
		).toHaveLength(1);
	});
	it.each([null, undefined, "", " ", -1, Infinity, true, {}])(
		"does not turn missing or invalid measurements into zero: %s",
		(value) => {
			expect(formatRequestMetric(value, " ms")).toBe("—");
		},
	);
	it("preserves a genuine zero and formats numeric strings", () => {
		expect(formatRequestMetric(0, " ms")).toBe("0 ms");
		expect(formatRequestMetric("1234.56", " tok/s")).toBe("1,234.6 tok/s");
	});
});
