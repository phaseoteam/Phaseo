// Generated from packages/shared/broadcast-destinations/safe-regex.ts by scripts/sync-broadcast-destinations.mjs. Do not edit.
// Broadcast rule regexes run against request and response text on the gateway,
// so they use a matcher whose time grows linearly with the input: the pattern is
// compiled to an NFA and every state is followed at once (a Pike VM), instead of
// backtracking. It reads the JavaScript syntax rules use in practice and rejects
// what needs backtracking: backreferences and lookaround.

export const MAX_RULE_REGEX_LENGTH = 128;
const MAX_INSTRUCTIONS = 2_000;

type CharTest = (code: number) => boolean;
type AssertKind = "start" | "end" | "word" | "not_word";

type Node =
	| { type: "char"; test: CharTest }
	| { type: "seq"; items: Node[] }
	| { type: "alt"; options: Node[] }
	| { type: "repeat"; node: Node; min: number; max: number }
	| { type: "assert"; kind: AssertKind };

type Inst =
	| { op: "char"; test: CharTest }
	| { op: "split"; x: number; y: number }
	| { op: "jmp"; x: number }
	| { op: "assert"; kind: AssertKind }
	| { op: "match" };

export type SafeRegex = { test(input: string): boolean };

class PatternError extends Error {}

const isDigit: CharTest = (code) => code >= 48 && code <= 57;
const isWord: CharTest = (code) => isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
const isSpace: CharTest = (code) =>
	(code >= 9 && code <= 13) || code === 32 || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) ||
	code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
const isLineTerminator: CharTest = (code) => code === 10 || code === 13 || code === 0x2028 || code === 0x2029;
const not = (test: CharTest): CharTest => (code) => !test(code);
const literal = (expected: number): CharTest => (code) => code === expected;

const CLASS_ESCAPES: Record<string, CharTest> = {
	d: isDigit, D: not(isDigit), w: isWord, W: not(isWord), s: isSpace, S: not(isSpace),
};
const CONTROL_ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, v: 11, f: 12 };

function parse(pattern: string): Node {
	let index = 0;
	const peek = () => pattern[index];
	function fail(message: string): never {
		throw new PatternError(message);
	}

	// A `{n}`, `{n,}` or `{n,m}` quantifier at the current position, if there is one.
	const braces = (): { min: number; max: number; length: number } | null => {
		const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(index));
		if (!match) return null;
		const min = Number(match[1]);
		const max = match[2] === undefined ? min : match[3] === "" ? Infinity : Number(match[3]);
		if (max < min) fail("Numbers out of order in {} quantifier");
		return { min, max, length: match[0].length };
	};

	const hex = (digits: number): number | null => {
		const text = pattern.slice(index, index + digits);
		if (text.length !== digits || !/^[0-9a-fA-F]+$/.test(text)) return null;
		index += digits;
		return Number.parseInt(text, 16);
	};

	// The escape after a backslash, as one code unit or a character class.
	const escape = (inClass: boolean): { code: number } | { test: CharTest } | { assert: AssertKind } => {
		const char = pattern[index++];
		if (char === undefined) fail("\\ at end of pattern");
		if (CLASS_ESCAPES[char]) return { test: CLASS_ESCAPES[char] };
		if (char === "b") return inClass ? { code: 8 } : { assert: "word" };
		if (char === "B" && !inClass) return { assert: "not_word" };
		if (CONTROL_ESCAPES[char] !== undefined) return { code: CONTROL_ESCAPES[char] };
		if (char === "0" && !isDigit(pattern.charCodeAt(index))) return { code: 0 };
		if (isDigit(char.charCodeAt(0)) || char === "k") fail("Backreferences are not supported");
		if (char === "x") return { code: hex(2) ?? 120 };
		if (char === "u") return { code: hex(4) ?? 117 };
		if (char === "c") {
			const letter = pattern.charCodeAt(index);
			if ((letter >= 65 && letter <= 90) || (letter >= 97 && letter <= 122)) {
				index += 1;
				return { code: letter % 32 };
			}
			fail("Unsupported \\c escape");
		}
		return { code: char.charCodeAt(0) };
	};

	const characterClass = (): Node => {
		const negate = peek() === "^";
		if (negate) index += 1;
		const tests: CharTest[] = [];
		const atom = (): { code: number } | { test: CharTest } => {
			const char = pattern[index++];
			if (char !== "\\") return { code: char.charCodeAt(0) };
			const escaped = escape(true);
			return "assert" in escaped ? fail("Unsupported escape in character class") : escaped;
		};
		while (peek() !== "]") {
			if (index >= pattern.length) fail("Unterminated character class");
			const start = atom();
			if (peek() === "-" && pattern[index + 1] !== "]" && index + 1 < pattern.length) {
				index += 1;
				const end = atom();
				if ("code" in start && "code" in end) {
					if (end.code < start.code) fail("Range out of order in character class");
					const [low, high] = [start.code, end.code];
					tests.push((code) => code >= low && code <= high);
					continue;
				}
				// Like JavaScript without the u flag, a class escape at either end makes `-` literal.
				tests.push("code" in start ? literal(start.code) : start.test, literal(45), "code" in end ? literal(end.code) : end.test);
				continue;
			}
			tests.push("code" in start ? literal(start.code) : start.test);
		}
		index += 1;
		const matches: CharTest = (code) => tests.some((test) => test(code));
		return { type: "char", test: negate ? not(matches) : matches };
	};

	const atom = (): Node => {
		const char = pattern[index++];
		switch (char) {
			case "(": {
				if (pattern.startsWith("?:", index)) index += 2;
				else if (pattern.startsWith("?<", index) && !/^\?<[=!]/.test(pattern.slice(index))) {
					const name = /^\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(index));
					if (!name) fail("Invalid capture group name");
					index += name![0].length;
				} else if (peek() === "?") fail("Lookahead and lookbehind are not supported");
				const node = alternation();
				if (pattern[index++] !== ")") fail("Unterminated group");
				return node;
			}
			case ")": return fail("Unmatched ')'");
			case "[": return characterClass();
			case ".": return { type: "char", test: not(isLineTerminator) };
			case "^": return { type: "assert", kind: "start" };
			case "$": return { type: "assert", kind: "end" };
			case "*": case "+": case "?": return fail("Nothing to repeat");
			case "\\": {
				const escaped = escape(false);
				if ("assert" in escaped) return { type: "assert", kind: escaped.assert };
				return { type: "char", test: "code" in escaped ? literal(escaped.code) : escaped.test };
			}
			case "{":
				index -= 1;
				if (braces()) fail("Nothing to repeat");
				index += 1;
				return { type: "char", test: literal(123) };
			default: return { type: "char", test: literal(char.charCodeAt(0)) };
		}
	};

	const quantified = (): Node => {
		const node = atom();
		let bounds: { min: number; max: number } | null = null;
		const char = peek();
		if (char === "*") bounds = { min: 0, max: Infinity };
		else if (char === "+") bounds = { min: 1, max: Infinity };
		else if (char === "?") bounds = { min: 0, max: 1 };
		if (bounds) index += 1;
		else if (char === "{") {
			const found = braces();
			if (found) {
				index += found.length;
				bounds = found;
			}
		}
		if (!bounds) return node;
		if (node.type === "assert") fail("Nothing to repeat");
		if (peek() === "?") index += 1; // Lazy and greedy match the same strings.
		return { type: "repeat", node, min: bounds.min, max: bounds.max };
	};

	const sequence = (): Node => {
		const items: Node[] = [];
		while (index < pattern.length && peek() !== "|" && peek() !== ")") items.push(quantified());
		return { type: "seq", items };
	};

	const alternation = (): Node => {
		const options = [sequence()];
		while (peek() === "|") {
			index += 1;
			options.push(sequence());
		}
		return options.length === 1 ? options[0] : { type: "alt", options };
	};

	const node = alternation();
	if (index < pattern.length) fail("Unmatched ')'");
	return node;
}

function compile(node: Node): Inst[] {
	const program: Inst[] = [];
	const push = (inst: Inst): number => {
		if (program.length >= MAX_INSTRUCTIONS) throw new PatternError("Pattern is too complex");
		program.push(inst);
		return program.length - 1;
	};
	const emit = (current: Node): void => {
		switch (current.type) {
			case "char": push({ op: "char", test: current.test }); return;
			case "assert": push({ op: "assert", kind: current.kind }); return;
			case "seq": for (const item of current.items) emit(item); return;
			case "alt": {
				const jumps: Array<{ op: "jmp"; x: number }> = [];
				current.options.forEach((option, position) => {
					if (position < current.options.length - 1) {
						const split = { op: "split" as const, x: 0, y: 0 };
						split.x = push(split) + 1;
						emit(option);
						const jump = { op: "jmp" as const, x: 0 };
						push(jump);
						jumps.push(jump);
						split.y = program.length;
					} else emit(option);
				});
				for (const jump of jumps) jump.x = program.length;
				return;
			}
			case "repeat": {
				for (let count = 0; count < current.min; count += 1) emit(current.node);
				if (current.max === Infinity) {
					const split = { op: "split" as const, x: 0, y: 0 };
					const loop = push(split);
					split.x = loop + 1;
					emit(current.node);
					push({ op: "jmp", x: loop });
					split.y = program.length;
					return;
				}
				const splits: Array<{ op: "split"; x: number; y: number }> = [];
				for (let count = current.min; count < current.max; count += 1) {
					const split = { op: "split" as const, x: 0, y: 0 };
					split.x = push(split) + 1;
					splits.push(split);
					emit(current.node);
				}
				for (const split of splits) split.y = program.length;
				return;
			}
		}
	};
	emit(node);
	push({ op: "match" });
	return program;
}

function assertion(kind: AssertKind, input: string, position: number): boolean {
	if (kind === "start") return position === 0;
	if (kind === "end") return position === input.length;
	const before = position > 0 && isWord(input.charCodeAt(position - 1));
	const after = position < input.length && isWord(input.charCodeAt(position));
	return kind === "word" ? before !== after : before === after;
}

// Same result as `new RegExp(pattern).test(input)`, with no flags.
function run(program: Inst[], input: string): boolean {
	const seen = new Int32Array(program.length).fill(-1);
	let generation = 0;
	const add = (list: number[], start: number, position: number) => {
		const stack = [start];
		while (stack.length) {
			const pc = stack.pop()!;
			if (seen[pc] === generation) continue;
			seen[pc] = generation;
			const inst = program[pc];
			if (inst.op === "jmp") stack.push(inst.x);
			else if (inst.op === "split") stack.push(inst.y, inst.x);
			else if (inst.op === "assert") {
				if (assertion(inst.kind, input, position)) stack.push(pc + 1);
			} else list.push(pc);
		}
	};
	let current: number[] = [];
	add(current, 0, 0);
	for (let position = 0; ; position += 1) {
		if (current.some((pc) => program[pc].op === "match")) return true;
		if (position === input.length) return false;
		generation += 1;
		const next: number[] = [];
		const code = input.charCodeAt(position);
		for (const pc of current) {
			const inst = program[pc];
			if (inst.op === "char" && inst.test(code)) add(next, pc + 1, position + 1);
		}
		// The search may start at any position.
		add(next, 0, position + 1);
		current = next;
	}
}

export function compileSafeRegex(pattern: string): { ok: true; regex: SafeRegex } | { ok: false; error: string } {
	if (pattern.length > MAX_RULE_REGEX_LENGTH) return { ok: false, error: `Regex must be at most ${MAX_RULE_REGEX_LENGTH} characters` };
	try {
		const program = compile(parse(pattern));
		return { ok: true, regex: { test: (input) => run(program, input) } };
	} catch (error) {
		if (error instanceof PatternError) return { ok: false, error: `Invalid regex: ${error.message}` };
		throw error;
	}
}
