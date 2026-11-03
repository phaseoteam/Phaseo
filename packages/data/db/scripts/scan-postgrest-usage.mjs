#!/usr/bin/env node
// Inventory supabase-js data-API usage across the apps, so POSTGREST-COVERAGE.md
// can say which PostgREST features are really used.
//
//   node packages/data/db/scripts/scan-postgrest-usage.mjs [--json] [--examples]
//
// It is a heuristic scanner (not a TypeScript parser): it finds `.from(` /
// `.rpc(` / `.schema(` chains, walks the method calls that follow, and parses
// select strings that are literals (or same-file constants).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const roots = ["apps/api/src", "apps/web-api/src", "apps/web/src", "apps/mobile"];
const skipDir = /(^|[\\/])(node_modules|__tests__|tests?|e2e|\.next|dist|build|android|ios|\.expo)([\\/]|$)/;
const skipFile = /\.(test|spec)\.[cm]?[jt]sx?$|mock/i;

function walk(dir, out) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const name of entries) {
		const full = join(dir, name);
		const rel = relative(repoRoot, full);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (!skipDir.test(name)) walk(full, out);
		} else if (/\.[cm]?[jt]sx?$/.test(name) && !skipFile.test(name) && !name.endsWith(".d.ts")) {
			out.push(rel);
		}
	}
	return out;
}

/** Skip a string/template/comment starting at i; returns index after it. */
function skipLiteral(src, i) {
	const c = src[i];
	if (c === '"' || c === "'") {
		for (let j = i + 1; j < src.length; j++) {
			if (src[j] === "\\") j++;
			else if (src[j] === c) return j + 1;
		}
		return src.length;
	}
	if (c === "`") {
		for (let j = i + 1; j < src.length; j++) {
			if (src[j] === "\\") j++;
			else if (src[j] === "`") return j + 1;
			else if (src[j] === "$" && src[j + 1] === "{") j = matchClose(src, j + 1) - 1;
		}
		return src.length;
	}
	if (c === "/" && src[i + 1] === "/") {
		const nl = src.indexOf("\n", i);
		return nl === -1 ? src.length : nl;
	}
	if (c === "/" && src[i + 1] === "*") {
		const end = src.indexOf("*/", i + 2);
		return end === -1 ? src.length : end + 2;
	}
	return -1;
}

/** src[open] is ( [ or {; returns index just after the matching close. */
function matchClose(src, open) {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const skipped = skipLiteral(src, i);
		if (skipped !== -1) {
			i = skipped - 1;
			continue;
		}
		const c = src[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return src.length;
}

function splitTopLevelArgs(argText) {
	const args = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < argText.length; i++) {
		const skipped = skipLiteral(argText, i);
		if (skipped !== -1) {
			i = skipped - 1;
			continue;
		}
		const c = argText[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") depth--;
		else if (c === "," && depth === 0) {
			args.push(argText.slice(start, i).trim());
			start = i + 1;
		}
	}
	const last = argText.slice(start).trim();
	if (last) args.push(last);
	return args;
}

function literalValue(arg, constants) {
	if (!arg) return null;
	const m = /^(["'])([\s\S]*)\1$/.exec(arg);
	if (m) return m[2];
	if (arg.startsWith("`") && arg.endsWith("`")) return arg.slice(1, -1);
	if (/^[A-Za-z_$][\w$]*$/.test(arg) && constants.has(arg)) return constants.get(arg);
	return null;
}

function collectConstants(src) {
	const constants = new Map();
	const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(["'`])/g;
	let m;
	while ((m = re.exec(src))) {
		const start = m.index + m[0].length - 1;
		const end = skipLiteral(src, start);
		const raw = src.slice(start + 1, end - 1);
		if (m[2] === "`" || !raw.includes("\n")) constants.set(m[1], raw);
	}
	return constants;
}

const NOT_DB_RECEIVER = /(?:Array|Buffer|Uint8Array|Int8Array|Uint16Array|Float32Array|Float64Array|Object|Set|Map|Promise|Decimal|labels|Observable|stream|Readable|Iterator|BigInt64Array|Uint32Array|Int32Array)\s*$/;

const features = new Map();
function hit(feature, where) {
	let f = features.get(feature);
	if (!f) features.set(feature, (f = { count: 0, examples: [] }));
	f.count++;
	if (f.examples.length < 6) f.examples.push(where);
}

// --- select string parsing (PostgREST grammar subset) ----------------------
function analyseSelect(select, where, ctx) {
	const s = select.replace(/\s+/g, "");
	if (s.includes("${")) hit("select: interpolated (dynamic) select string", where);
	const walkList = (text, depth) => {
		for (const item of splitTopLevelArgs(text)) {
			if (!item) continue;
			const paren = item.indexOf("(");
			if (paren > 0 && item.endsWith(")") && !/\.\w+\(\)$/.test(item) && !/^count\(\)$/.test(item)) {
				let head = item.slice(0, paren);
				const inner = item.slice(paren + 1, -1);
				if (head.startsWith("...")) {
					hit("select: spread embed ...rel(cols)", where);
					head = head.slice(3);
				}
				if (head.includes(":")) hit("select: embed alias alias:rel(cols)", where);
				const hints = head.split("!").slice(1);
				for (const h of hints) {
					if (h === "inner") hit("select: !inner embed", where);
					else if (h === "left") hit("select: !left embed", where);
					else hit("select: !hint embed (fk/column disambiguation)", where);
				}
				hit(depth === 0 ? "select: embedded resource rel(cols)" : "select: nested embed (depth>1)", where);
				walkList(inner, depth + 1);
				continue;
			}
			if (item === "*") hit("select: *", where);
			else if (/^count\(\)$/.test(item) || /:count\(\)$/.test(item)) hit("select: count() aggregate", where);
			else if (/\.(sum|avg|min|max|count)\(\)/.test(item)) hit("select: col.agg() aggregate", where);
			if (/^[A-Za-z_][\w]*:/.test(item) && !item.includes("(")) hit("select: column alias alias:col", where);
			if (item.includes("::")) hit("select: cast col::type", where);
			if (item.includes("->>")) hit("select: json path ->>", where);
			else if (item.includes("->")) hit("select: json path ->", where);
		}
	};
	walkList(s, 0);
	if (ctx) ctx.select = s;
}

// --- filter-string parsing for .or()/.not()/.filter() ------------------------
function analyseLogicTree(text, where) {
	const t = text.replace(/\s+/g, "");
	if (/(^|[,(])and\(/.test(t)) hit("filter: and(...) nested in or()", where);
	if (/(^|[,(])or\(/.test(t)) hit("filter: or(...) nested", where);
	if (/(^|[,(])not\.(and|or)\(/.test(t)) hit("filter: not.and/not.or nested", where);
	const opRe = /(?:^|[,(])([\w.>\-]+?)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|fts|plfts|phfts|wfts|match|imatch|isdistinct|sl|sr|nxl|nxr|adj)\./g;
	let m;
	while ((m = opRe.exec(t))) {
		hit(`filter: or()-string op ${m[2] ? "not." : ""}${m[3]}`, where);
		if (m[1].includes(".") && !m[1].includes("->")) hit("filter: or()-string on embedded column rel.col", where);
		if (m[1].includes("->")) hit("filter: or()-string on json path", where);
	}
}

const DATA_METHODS = new Set([
	"select", "insert", "upsert", "update", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
	"contains", "containedBy", "overlaps", "textSearch", "match", "not", "or", "filter", "order", "limit", "range", "single",
	"maybeSingle", "csv", "abortSignal", "returns", "overrideTypes", "throwOnError", "explain", "geojson", "likeAllOf",
	"likeAnyOf", "ilikeAllOf", "ilikeAnyOf", "isDistinct", "regexMatch", "regexIMatch", "rangeGt", "rangeGte", "rangeLt",
	"rangeLte", "rangeAdjacent", "setHeader", "maxAffected", "then", "schema", "rpc", "from",
]);

const chains = [];
const files = roots.flatMap((r) => walk(join(repoRoot, r), []));

for (const file of files) {
	const src = readFileSync(join(repoRoot, file), "utf8");
	if (!/\.(from|rpc)\(/.test(src)) continue;
	const constants = collectConstants(src);
	const lineOf = (idx) => src.slice(0, idx).split("\n").length;
	const re = /\.(from|rpc|schema)\s*(<[^()]*>)?\s*\(/g;
	let m;
	while ((m = re.exec(src))) {
		const before = src.slice(Math.max(0, m.index - 40), m.index);
		if (m[1] === "from" && NOT_DB_RECEIVER.test(before)) continue;
		// only start chains (skip .from that is itself inside a chain we already took)
		const where = `${file.replace(/\\/g, "/")}:${lineOf(m.index)}`;
		const open = m.index + m[0].length - 1;
		let close = matchClose(src, open);
		const firstArgs = splitTopLevelArgs(src.slice(open + 1, close - 1));
		const firstLit = literalValue(firstArgs[0], constants);
		if (m[1] === "from" && firstLit === null && !/^[A-Za-z_$][\w$.]*(\[[^\]]+\])?$/.test(firstArgs[0] ?? "")) continue;
		if (m[1] === "from" && firstLit !== null && !/^[A-Za-z_][\w]*$/.test(firstLit)) continue; // e.g. Array.from("abc")
		const chain = { where, root: m[1], target: firstLit ?? `<${firstArgs[0]}>`, methods: [] };
		if (m[1] === "rpc") {
			hit("rpc: POST /rpc/fn named args", where);
			if (firstLit === null) hit("rpc: dynamic function name", where);
			const opts = firstArgs[2] ?? "";
			if (/head:\s*true/.test(opts)) hit("rpc: head:true", where);
			if (/count:/.test(opts)) hit("rpc: count option", where);
			if (/get:\s*true/.test(opts)) hit("rpc: get:true (GET /rpc)", where);
			if (!firstArgs[1]) hit("rpc: no args", where);
		} else if (m[1] === "schema") {
			hit(`schema(): ${firstLit ?? "dynamic"}`, where);
		} else {
			hit("from(): table/view", where);
			if (firstLit === null) hit("from(): dynamic table name", where);
		}
		// walk following .method(...) calls
		let i = close;
		for (;;) {
			const rest = /^\s*(?:\/\/[^\n]*\n\s*)*(\?\.)?\.\s*([A-Za-z_$][\w$]*)\s*(<(?:[^<>]|<[^<>]*>)*>)?\s*\(/.exec(src.slice(i, i + 400));
			if (!rest || !DATA_METHODS.has(rest[2])) break;
			const name = rest[2];
			if (name === "then" || name === "from" || name === "rpc") break;
			const o = i + rest[0].length - 1;
			const c = matchClose(src, o);
			const args = splitTopLevelArgs(src.slice(o + 1, c - 1));
			chain.methods.push({ name, args });
			i = c;
		}
		chains.push(chain);
		for (const { name, args } of chain.methods) {
			const a0 = literalValue(args[0], constants);
			switch (name) {
				case "select": {
					if (args.length === 0) hit(chain.methods[0]?.name === "select" ? "select(): no args (*)" : "mutation .select() returning rows", where);
					else if (a0 !== null) analyseSelect(a0, where, chain);
					else hit("select: non-literal select (variable)", where);
					if (chain.methods[0]?.name !== "select" && chain.root === "from") hit("mutation .select(cols) returning rows", where);
					const opts = args[1] ?? "";
					if (/count:\s*["']exact/.test(opts)) hit("count: exact", where);
					if (/count:\s*["']planned/.test(opts)) hit("count: planned", where);
					if (/count:\s*["']estimated/.test(opts)) hit("count: estimated", where);
					if (/count:\s*[^"'\s]/.test(opts)) hit("count: dynamic value", where);
					if (/head:\s*true/.test(opts)) hit("select head:true", where);
					if (/head:\s*[^t\s]/.test(opts)) hit("select head: dynamic", where);
					if (chain.root === "rpc") hit("rpc: .select() on result", where);
					break;
				}
				case "insert":
				case "upsert": {
					const opts = args[1] ?? "";
					hit(`${name}`, where);
					if (/^\[/.test(args[0] ?? "")) hit(`${name}: bulk array literal`, where);
					if (/onConflict/.test(opts)) hit("upsert onConflict", where);
					if (/ignoreDuplicates:\s*true/.test(opts)) hit("upsert ignoreDuplicates:true", where);
					if (/ignoreDuplicates:\s*[^t\s]/.test(opts)) hit("upsert ignoreDuplicates: dynamic/false", where);
					if (/defaultToNull/.test(opts)) hit(`${name} defaultToNull`, where);
					if (/count:/.test(opts)) hit(`${name} count option`, where);
					break;
				}
				case "update":
				case "delete":
					hit(name, where);
					if (/count:/.test(name === "update" ? (args[1] ?? "") : (args[0] ?? ""))) hit(`${name} count option`, where);
					break;
				case "order": {
					hit("order", where);
					const opts = args[1] ?? "";
					if (/nullsFirst/.test(opts)) hit("order nullsFirst", where);
					if (/(foreignTable|referencedTable)/.test(opts)) hit("order on embedded (referencedTable)", where);
					if (a0 && a0.includes(".")) hit("order: dotted column (embedded/json)", where);
					if (a0 && a0.includes("->")) hit("order: json path", where);
					if (a0 && a0.includes(",")) hit("order: comma list in one call", where);
					break;
				}
				case "limit":
				case "range": {
					hit(name, where);
					if (/(foreignTable|referencedTable)/.test(args.at(-1) ?? "")) hit(`${name} on embedded (referencedTable)`, where);
					break;
				}
				case "or": {
					hit("or()", where);
					if (a0 !== null) analyseLogicTree(a0, where);
					else hit("or(): non-literal", where);
					if (/(foreignTable|referencedTable)/.test(args[1] ?? "")) hit("or() on embedded (referencedTable)", where);
					break;
				}
				case "not": {
					const op = literalValue(args[1], constants);
					hit(`not(col, ${op ?? "dynamic"})`, where);
					break;
				}
				case "filter": {
					const op = literalValue(args[1], constants);
					hit(`filter(col, ${op ?? "dynamic"})`, where);
					if (op === "or" || op === "and") analyseLogicTree(literalValue(args[2], constants) ?? "", where);
					break;
				}
				case "textSearch": {
					const opts = args[2] ?? "";
					const type = /type:\s*["'](\w+)/.exec(opts)?.[1] ?? "fts";
					hit(`textSearch type=${type}`, where);
					break;
				}
				default:
					hit(name, where);
			}
			if (["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "overlaps", "not", "filter", "match"].includes(name)) {
				if (a0 && /^[A-Za-z_]\w*\.[A-Za-z_]/.test(a0) && !a0.includes("->")) hit("filter on embedded column rel.col", where);
				if (a0 && a0.includes("->")) hit("filter on json path col->x", where);
				if (a0 === null && args[0] && !/^["'`]/.test(args[0])) hit("filter: dynamic column name", where);
			}
			if (name === "is") {
				const v = args[1] ?? "";
				if (/^(true|false)$/.test(v)) hit("is(col, boolean)", where);
			}
			if (name === "contains") {
				const v = args[1] ?? "";
				if (/^\[/.test(v)) hit("contains(col, array)", where);
				else if (/^\{/.test(v)) hit("contains(col, object/jsonb)", where);
				else if (/^["'`]/.test(v)) hit("contains(col, string range/literal)", where);
				else hit("contains(col, variable)", where);
			}
		}
	}
}

const sorted = [...features.entries()].sort((a, b) => a[0].localeCompare(b[0]));
if (process.argv.includes("--json")) {
	console.log(JSON.stringify({ files: files.length, chains: chains.length, features: Object.fromEntries(sorted) }, null, 2));
} else if (process.argv.includes("--chains")) {
	for (const c of chains) console.log(`${c.where}\t${c.root}(${c.target})\t${c.methods.map((m) => m.name).join(".")}\t${c.select ?? ""}`);
} else {
	console.log(`files scanned: ${files.length}; chains: ${chains.length}`);
	for (const [k, v] of sorted) console.log(`${String(v.count).padStart(5)}  ${k}${process.argv.includes("--examples") ? `   e.g. ${v.examples.slice(0, 3).join(", ")}` : ""}`);
}
