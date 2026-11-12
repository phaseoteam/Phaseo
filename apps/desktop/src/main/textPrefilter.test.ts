import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { likePattern, textPrefilter } from "./textPrefilter";

// Texts chosen to catch a prefilter that drops real matches: case, JSON escapes, LIKE's own wildcards, the two
// non-ASCII letters toLowerCase turns into ASCII, accents and other scripts.
const texts = [
	"Provider FAILOVER after a 429", "provider-failover", "The KELVIN sign: Kelvin and K", "Dotted İstanbul and İ", "Say \"hello\" then \\path\\to",
	"100% done_now", "a_b%c", "line one\nline two\ttabbed", "Café CRÈME brûlée", "日本語のテキスト", "Mixed İKİ and kık", "emoji 😀 grin", "", "IIIKKK", "ẞtraße",
];
const needles = ["failover", "FAILOVER", "kelvin", "k", "kelvin and k", "istanbul", "i", "i̇stanbul", "hello", "\"hello\"", "\\path", "100%", "%", "_", "done_now", "a_b", "b%c",
	"line two", "one\nline", "café", "crème", "日本", "iki", "kık", "😀", "grin", "z", "ii", "kk", "straße", "ß", " "];

function database() {
	const db = new DatabaseSync(":memory:");
	db.function("history_lower", { deterministic: true }, value => typeof value === "string" ? value.toLowerCase() : "");
	db.exec("CREATE TABLE rows (id INTEGER PRIMARY KEY, data)");
	const insert = db.prepare("INSERT INTO rows (data) VALUES (?)");
	for (const text of texts) insert.run(JSON.stringify({ id: "m", role: "user", text }));
	return db;
}

describe("textPrefilter", () => {
	it("never drops a row the exact match keeps", () => {
		const db = database();
		for (const needle of needles) {
			const lower = needle.toLowerCase(), exact = "instr(history_lower(json_extract(data, '$.text')), $needle) > 0";
			const all = db.prepare(`SELECT id FROM rows WHERE ${exact} ORDER BY id`).all({ needle: lower }).map(row => row.id);
			const filter = textPrefilter("data", "pattern", needle);
			const filtered = db.prepare(`SELECT id FROM rows WHERE ${filter.sql} AND ${exact} ORDER BY id`).all({ needle: lower, ...filter.params }).map(row => row.id);
			expect(filtered, needle).toEqual(all);
		}
	});

	it("narrows ASCII needles and leaves the rest to the full scan", () => {
		expect(likePattern("Failover")).toBe("%fa_lover%");
		expect(likePattern("kink")).toBe("%__n_%");
		expect(likePattern("100%_")).toBe("%100\\%\\_%");
		for (const needle of ["", "café", "日本", "say \"hi\"", "a\\b", "tab\there"]) expect(likePattern(needle), needle).toBeUndefined();
		const db = database();
		const filter = textPrefilter("data", "pattern", "failover");
		expect(db.prepare(`SELECT count(*) AS n FROM rows WHERE ${filter.sql}`).get({ ...filter.params })).toEqual({ n: 2 });
	});

	it("lets compressed rows through", () => {
		const db = database();
		db.prepare("INSERT INTO rows (data) VALUES (?)").run(new Uint8Array([1, 2, 3]));
		const filter = textPrefilter("data", "pattern", "anything");
		expect(db.prepare(`SELECT count(*) AS n FROM rows WHERE ${filter.sql}`).get({ ...filter.params })).toEqual({ n: 1 });
	});
});
