import { describe, expect, it } from "vitest";
import { compileSafeRegex } from "./safe-regex";

function matches(pattern: string, input: string): boolean {
	const compiled = compileSafeRegex(pattern);
	if (!compiled.ok) throw new Error(compiled.error);
	return compiled.regex.test(input);
}

// Deterministic so a failure reproduces.
function random(seed: number) {
	let state = seed;
	return (limit: number) => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state % limit;
	};
}

describe("compileSafeRegex", () => {
	it("agrees with RegExp on common rule patterns", () => {
		const cases: Array<[string, string[]]> = [
			["^gpt-5", ["gpt-5-mini", "openai/gpt-5", ""]],
			["claude-(opus|sonnet)-\\d+(\\.\\d+)?$", ["claude-opus-5", "claude-sonnet-4.5", "claude-haiku-5", "claude-opus-5x"]],
			["\\bpassword\\b", ["my password is", "passwords", "password", "xpassword"]],
			["[A-Z]{2,3}-\\d{4,}", ["AB-1234", "ABCD-12", "x ZZ-99999 y", "ab-1234"]],
			["^[^@\\s]+@[\\w.-]+\\.[a-z]{2,}$", ["a@b.co", "a b@c.de", "x@y", "first.last@sub.example.org"]],
			["(?:foo|bar)+baz", ["foofoobarbaz", "baz", "foobaz!"]],
			["(?<team>[a-z]+)/(prod|dev)", ["growth/prod", "Growth/prod", "growth/stage"]],
			["a.c", ["abc", "a\nc", "a\rc", "ac"]],
			["[]", ["", "a"]],
			["[^]", ["", "\n"]],
			["\\u00e9t\\x65", ["été", "ete"]],
			["[\\w-]+", ["-", "!"]],
			["a{3}", ["aa", "aaa"]],
			["a{,3}", ["a{,3}", "aaa"]],
			["x{2,}?y", ["xxy", "xy"]],
			["\\{\\}\\[\\]\\(\\)\\.\\*\\+\\?\\^\\$\\|\\\\", ["{}[]().*+?^$|\\", "{}"]],
			["", ["", "anything"]],
			["\\Bend", ["bend", "end", "the end"]],
		];
		for (const [pattern, inputs] of cases) {
			for (const input of inputs) expect([pattern, input, matches(pattern, input)]).toEqual([pattern, input, new RegExp(pattern).test(input)]);
		}
	});

	it("agrees with RegExp on random patterns", () => {
		const next = random(42);
		const pieces = ["a", "b", "c", ".", "\\d", "\\w", "\\s", "[ab]", "[^a]", "[a-c]", "^", "$", "\\b", "(", ")", "(?:", "|", "*", "+", "?", "{2}", "{1,3}", "{0,}", "*?"];
		const alphabet = "abc1 _\n";
		let compared = 0;
		for (let round = 0; round < 3_000; round += 1) {
			const pattern = Array.from({ length: 1 + next(8) }, () => pieces[next(pieces.length)]).join("");
			let native: RegExp;
			try {
				native = new RegExp(pattern);
			} catch {
				expect(compileSafeRegex(pattern).ok, pattern).toBe(false);
				continue;
			}
			const compiled = compileSafeRegex(pattern);
			expect(compiled.ok, pattern).toBe(true);
			if (!compiled.ok) continue;
			for (let sample = 0; sample < 5; sample += 1) {
				const input = Array.from({ length: next(10) }, () => alphabet[next(alphabet.length)]).join("");
				expect([pattern, input, compiled.regex.test(input)]).toEqual([pattern, input, native.test(input)]);
				compared += 1;
			}
		}
		expect(compared).toBeGreaterThan(5_000);
	});

	it("runs patterns that make a backtracking engine hang in linear time", () => {
		const input = "a".repeat(2_000);
		for (const pattern of ["(a+)+b", "(a|a)*b", "(a*)*b", "^(\\w+\\s?)*$!", "(.*a){12}b"]) {
			const started = performance.now();
			expect(matches(pattern, input)).toBe(false);
			expect(performance.now() - started, pattern).toBeLessThan(1_000);
		}
	});

	it("rejects backreferences, lookaround and invalid syntax", () => {
		expect(compileSafeRegex("(a)\\1")).toEqual({ ok: false, error: "Invalid regex: Backreferences are not supported" });
		expect(compileSafeRegex("(?<x>a)\\k<x>")).toEqual({ ok: false, error: "Invalid regex: Backreferences are not supported" });
		expect(compileSafeRegex("foo(?=bar)")).toEqual({ ok: false, error: "Invalid regex: Lookahead and lookbehind are not supported" });
		expect(compileSafeRegex("(?<!x)y")).toEqual({ ok: false, error: "Invalid regex: Lookahead and lookbehind are not supported" });
		expect(compileSafeRegex("(abc")).toEqual({ ok: false, error: "Invalid regex: Unterminated group" });
		expect(compileSafeRegex("abc)")).toEqual({ ok: false, error: "Invalid regex: Unmatched ')'" });
		expect(compileSafeRegex("[z-a]")).toEqual({ ok: false, error: "Invalid regex: Range out of order in character class" });
		expect(compileSafeRegex("*a")).toEqual({ ok: false, error: "Invalid regex: Nothing to repeat" });
		expect(compileSafeRegex("a".repeat(129))).toEqual({ ok: false, error: "Regex must be at most 128 characters" });
		expect(compileSafeRegex("(a{100}){100}")).toEqual({ ok: false, error: "Invalid regex: Pattern is too complex" });
		// Native RegExp rejects these too; a matcher that accepted them would select destinations.
		expect(() => new RegExp("(?<a>x)(?<a>y)")).toThrow();
		expect(compileSafeRegex("(?<a>x)(?<a>y)")).toEqual({ ok: false, error: "Invalid regex: Duplicate capture group names are not supported" });
		expect(compileSafeRegex("(?<a>x)(?<b>y)").ok).toBe(true);
	});

	it("stops at a shared step budget and treats it as no match", () => {
		const compiled = compileSafeRegex("(a?){900}b");
		if (!compiled.ok) throw new Error(compiled.error);
		expect(compiled.regex.size).toBeGreaterThan(1_500);
		const input = "a".repeat(2_000);
		const budget = { steps: 1_000_000 };
		const started = performance.now();
		expect(compiled.regex.test(input, budget)).toBe(false);
		expect(budget.steps).toBeLessThan(0);
		// The budget is spent: later tests against it stop straight away.
		expect(compiled.regex.test("ab", budget)).toBe(false);
		expect(performance.now() - started).toBeLessThan(1_000);
		// Small patterns finish well inside the same budget.
		const small = compileSafeRegex("checkout|billing");
		if (!small.ok) throw new Error(small.error);
		const fresh = { steps: 1_000_000 };
		expect(small.regex.test(`${"x".repeat(1_990)}billing`, fresh)).toBe(true);
		expect(fresh.steps).toBeGreaterThan(900_000);
	});
});
