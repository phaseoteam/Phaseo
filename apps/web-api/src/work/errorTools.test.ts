import { describe, expect, it } from "vitest";
import { applyRules, cleanUserId, hashErrorUser, parseRuleInput, parseSourcemapTarget, ruleMatches } from "./errorTools";
import { decodeVlq, mapFrames, sourcemapFileName, SourceMapReader } from "./sourcemap";

// A map esbuild wrote for a small minified file; the expected positions came from source-map-js.
const MAP = {"version":3,"sources":["src/checkout.js"],"sourcesContent":["export function checkout(cart) {\n  const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n  if (total > 1000) {\n    throw new RangeError(\"Cart total is too high: \" + total);\n  }\n  return applyDiscount(total, cart.code);\n}\nfunction applyDiscount(total, code) {\n  const rates = { SAVE10: 0.1, SAVE20: 0.2 };\n  return total * (1 - (rates[code] ?? 0));\n}\nexport const run = () => checkout({ items: [{ price: 600, quantity: 2 }], code: \"SAVE10\" });\n"],"mappings":"AAAO,SAASA,EAASC,EAAM,CAC7B,MAAMC,EAAQD,EAAK,MAAM,OAAO,CAACE,EAAKC,IAASD,EAAMC,EAAK,MAAQA,EAAK,SAAU,CAAC,EAClF,GAAIF,EAAQ,IACV,MAAM,IAAI,WAAW,2BAA6BA,CAAK,EAEzD,OAAOG,EAAcH,EAAOD,EAAK,IAAI,CACvC,CACA,SAASI,EAAcH,EAAOI,EAAM,CAElC,OAAOJ,GAAS,GADF,CAAE,OAAQ,GAAK,OAAQ,EAAI,EACdI,CAAI,GAAK,GACtC,CACO,MAAMC,EAAM,IAAMP,EAAS,CAAE,MAAO,CAAC,CAAE,MAAO,IAAK,SAAU,CAAE,CAAC,EAAG,KAAM,QAAS,CAAC","names":["checkout","cart","total","sum","item","applyDiscount","code","run"]};
const SAMPLES = [{"line":1,"column":1,"want":{"source":"src/checkout.js","line":1,"column":8}},{"line":1,"column":41,"want":{"source":"src/checkout.js","line":2,"column":41,"name":"item"}},{"line":1,"column":81,"want":{"source":"src/checkout.js","line":4,"column":5}},{"line":1,"column":121,"want":{"source":"src/checkout.js","line":4,"column":26}},{"line":1,"column":161,"want":{"source":"src/checkout.js","line":8,"column":31,"name":"code"}},{"line":1,"column":201,"want":{"source":"src/checkout.js","line":10,"column":34}}];

describe("source maps", () => {
	it("decodes VLQ values", () => {
		expect(decodeVlq("AAAA")).toEqual([0, 0, 0, 0]);
		expect(decodeVlq("SAASA")).toEqual([9, 0, 0, 9, 0]);
		expect(decodeVlq("D")).toEqual([-1]);
		expect(decodeVlq("gB")).toEqual([16]);
		expect(decodeVlq("g")).toEqual([]);
		expect(decodeVlq("!!")).toEqual([]);
	});

	it("finds the original position the reference implementation finds", () => {
		const reader = new SourceMapReader(MAP);
		for (const sample of SAMPLES) {
			const got = reader.originalPosition(sample.line, sample.column);
			expect(got).toEqual(sample.want);
		}
		expect(reader.originalPosition(99, 1)).toBeNull();
		expect(reader.originalPosition(0, 1)).toBeNull();
	});

	it("refuses index maps, other versions and bad JSON", () => {
		expect(SourceMapReader.parse(JSON.stringify(MAP))).not.toBeNull();
		expect(SourceMapReader.parse(JSON.stringify({ ...MAP, version: 2 }))).toBeNull();
		expect(SourceMapReader.parse(JSON.stringify({ version: 3, sections: [] }))).toBeNull();
		expect(SourceMapReader.parse("{")).toBeNull();
	});

	it("maps only frames whose file has a map, matched by file name", async () => {
		const reader = new SourceMapReader(MAP);
		const frames = [
			{ file: "https://shop.example/assets/checkout.min.js?v=3", line: 1, column: 81, function: "a" },
			{ file: "https://shop.example/assets/other.js", line: 1, column: 5 },
		];
		const loads: string[] = [];
		const mapped = await mapFrames(frames, new Map([["checkout.min.js", "key-1"]]), async (key) => { loads.push(key); return reader; });
		expect(mapped[0]!.original).toEqual({ file: "src/checkout.js", line: 4, column: 5 });
		expect(mapped[1]!.original).toBeUndefined();
		expect(loads).toEqual(["key-1"]);
		expect(sourcemapFileName("https://x.test/a/b/app.js#x")).toBe("app.js");
	});
});

describe("error rules and people affected", () => {
	const event = { type: "TypeError", message: "Cannot read properties of undefined (reading 'id')", environment: "production", frames: [{ file: "https://app.test/assets/vendor.js" }] };

	it("matches case-insensitively on each field and skips disabled rules", () => {
		expect(ruleMatches({ field: "message", pattern: "CANNOT READ", enabled: true }, event)).toBe(true);
		expect(ruleMatches({ field: "type", pattern: "range", enabled: true }, event)).toBe(false);
		expect(ruleMatches({ field: "file", pattern: "vendor.js", enabled: true }, event)).toBe(true);
		expect(ruleMatches({ field: "environment", pattern: "prod", enabled: false }, event)).toBe(false);
	});

	it("ignores on any ignore rule, otherwise takes the first assign rule", () => {
		const assign = (pattern: string, user: string) => ({ action: "assign" as const, field: "message" as const, pattern, enabled: true, assignee_user_id: user });
		expect(applyRules([assign("cannot", "u1"), assign("read", "u2")], event)).toEqual({ ignore: false, assigneeUserId: "u1" });
		expect(applyRules([assign("cannot", "u1"), { action: "ignore", field: "environment", pattern: "production", enabled: true, assignee_user_id: null }], event)).toEqual({ ignore: true, assigneeUserId: null });
		expect(applyRules([], event)).toEqual({ ignore: false, assigneeUserId: null });
	});

	it("validates rules", () => {
		expect(parseRuleInput({ action: "ignore", field: "message", pattern: " ResizeObserver loop " })).toEqual({ ok: true, value: { action: "ignore", field: "message", pattern: "ResizeObserver loop", assigneeUserId: null } });
		expect(parseRuleInput({ action: "assign", field: "type", pattern: "x" }).ok).toBe(false);
		expect(parseRuleInput({ action: "delete", field: "type", pattern: "x" }).ok).toBe(false);
		expect(parseRuleInput({ action: "ignore", field: "message", pattern: "" }).ok).toBe(false);
	});

	it("hashes user ids per project and never keeps the id", async () => {
		const a = await hashErrorUser("project-a", "Ana@Example.com");
		expect(a).toMatch(/^[0-9a-f]{32}$/);
		expect(await hashErrorUser("project-a", "ana@example.com")).toBe(a);
		expect(await hashErrorUser("project-b", "ana@example.com")).not.toBe(a);
		expect(cleanUserId(42)).toBe("42");
		expect(cleanUserId({ id: 1 })).toBeNull();
		expect(cleanUserId("x".repeat(201))).toBeNull();
	});

	it("validates source map upload targets", () => {
		expect(parseSourcemapTarget(" 1.4.0 ", "https://cdn.test/app.3f9a.js?x=1")).toEqual({ ok: true, release: "1.4.0", file: "app.3f9a.js" });
		expect(parseSourcemapTarget("", "app.js").ok).toBe(false);
		expect(parseSourcemapTarget("1", "app.css").ok).toBe(false);
	});
});
