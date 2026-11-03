/**
 * Parsers for PostgREST's query-string grammar (v12.2 ApiRequest/QueryParams):
 * select trees, filters, logic trees (or/and), order terms. Anything the
 * grammar allows but this package does not translate throws
 * UnsupportedFeatureError; malformed input throws PGRST100 like PostgREST.
 */
import { queryParamError, UnsupportedFeatureError } from "../errors";

export type JsonPathStep = { arrow: "->" | "->>"; key: string; index: boolean };
export type Field = { name: string; jsonPath: JsonPathStep[] };

export type SelectItem =
	| { kind: "star" }
	| { kind: "field"; field: Field; alias: string | null; cast: string | null }
	| { kind: "embed"; target: string; alias: string | null; hint: string | null; joinType: "left" | "inner" | null; children: SelectItem[] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const JSON_KEY = /^(?:[A-Za-z0-9_$\- ]+)$/;

/** Split on commas that are not inside parentheses or double quotes. */
export function splitTopLevel(text: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quoted = false;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === "\\") i++;
			else if (c === '"') quoted = false;
			continue;
		}
		if (c === '"') quoted = true;
		else if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "," && depth === 0) {
			out.push(text.slice(start, i));
			start = i + 1;
		}
		if (depth < 0) throw queryParamError("\"failed to parse\"", `unexpected ")" in ${text}`);
	}
	if (depth !== 0 || quoted) throw queryParamError("\"failed to parse\"", `unbalanced parentheses or quotes in ${text}`);
	out.push(text.slice(start));
	return out;
}

/** `col`, `col->a->>b`, `col->0` */
export function parseField(text: string, context: string): Field {
	if (text.startsWith('"')) throw new UnsupportedFeatureError("quoted column names", `@phaseo/db: quoted column names are not supported (${context}: ${text})`);
	const arrowIdx = text.indexOf("->");
	const name = arrowIdx === -1 ? text : text.slice(0, arrowIdx);
	if (!IDENT.test(name)) throw queryParamError("\"failed to parse\"", `invalid column ${JSON.stringify(text)} in ${context}`);
	const jsonPath: JsonPathStep[] = [];
	let pos = arrowIdx;
	while (pos !== -1 && pos < text.length) {
		const arrow = text.startsWith("->>", pos) ? "->>" : "->";
		const start = pos + arrow.length;
		const next = text.indexOf("->", start);
		const key = text.slice(start, next === -1 ? undefined : next);
		if (!key || !JSON_KEY.test(key)) throw queryParamError("\"failed to parse\"", `invalid JSON path ${JSON.stringify(text)} in ${context}`);
		jsonPath.push({ arrow, key, index: /^-?\d+$/.test(key) });
		pos = next;
	}
	return { name, jsonPath };
}

export function parseSelect(text: string): SelectItem[] {
	if (text === "") return [{ kind: "star" }];
	return splitTopLevel(text).map((raw) => parseSelectItem(raw));
}

function parseSelectItem(raw: string): SelectItem {
	if (raw === "") throw queryParamError("\"failed to parse select parameter ()\"", "empty select item");
	if (raw === "*") return { kind: "star" };
	if (raw.startsWith("...")) throw new UnsupportedFeatureError("select spread ...rel(cols)");
	let rest = raw;
	let alias: string | null = null;
	const aliasMatch = /^([A-Za-z_][A-Za-z0-9_]*):(?!:)/.exec(rest);
	if (aliasMatch) {
		alias = aliasMatch[1]!;
		rest = rest.slice(aliasMatch[0].length);
	}
	if (rest.startsWith("...")) throw new UnsupportedFeatureError("select spread ...rel(cols)");
	const open = rest.indexOf("(");
	if (open > 0 && rest.endsWith(")")) {
		const head = rest.slice(0, open);
		const inner = rest.slice(open + 1, -1);
		if (/^count$|\.(count|sum|avg|min|max)$/.test(head) && inner === "") {
			throw new UnsupportedFeatureError("aggregate functions in select (count(), col.sum(), ...)");
		}
		const [target, ...hints] = head.split("!");
		if (!target || !IDENT.test(target) || hints.some((h) => !IDENT.test(h))) {
			throw queryParamError(`"failed to parse select parameter (${raw})"`, `invalid embedded resource ${JSON.stringify(head)}`);
		}
		let hint: string | null = null;
		let joinType: "left" | "inner" | null = null;
		for (const h of hints) {
			if (h === "inner" || h === "left") {
				if (joinType) throw queryParamError(`"failed to parse select parameter (${raw})"`, "more than one join type");
				joinType = h;
			} else {
				if (hint) throw queryParamError(`"failed to parse select parameter (${raw})"`, "more than one hint");
				hint = h;
			}
		}
		if (inner === "") throw new UnsupportedFeatureError("empty embed rel() (filter-only embedding)");
		return { kind: "embed", target, alias, hint, joinType, children: parseSelect(inner) };
	}
	if (/\.(count|sum|avg|min|max)\(\)/.test(rest)) throw new UnsupportedFeatureError("aggregate functions in select (count(), col.sum(), ...)");
	let cast: string | null = null;
	const castIdx = rest.indexOf("::");
	if (castIdx !== -1) {
		cast = rest.slice(castIdx + 2);
		rest = rest.slice(0, castIdx);
		if (!IDENT.test(cast)) throw queryParamError(`"failed to parse select parameter (${raw})"`, `invalid cast ${cast}`);
	}
	if (rest === "*") throw queryParamError(`"failed to parse select parameter (${raw})"`, "* cannot take an alias or cast");
	return { kind: "field", field: parseField(rest, "select"), alias, cast };
}

// ---------------------------------------------------------------- filters

export type Quantifier = "any" | "all" | null;
export type Operation =
	| { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "match" | "imatch"; quant: Quantifier; value: string }
	| { op: "cs" | "cd" | "ov" | "sl" | "sr" | "nxr" | "nxl" | "adj"; value: string }
	| { op: "is"; value: "null" | "true" | "false" | "unknown" }
	| { op: "isdistinct"; value: string }
	| { op: "in"; values: string[] }
	| { op: "fts" | "plfts" | "phfts" | "wfts"; config: string | null; value: string };

export type Filter = { field: Field; negate: boolean; operation: Operation };
export type LogicTree = { kind: "expr"; negate: boolean; op: "and" | "or"; children: LogicTree[] } | { kind: "filter"; filter: Filter };

const QUANT_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "match", "imatch"]);
const SIMPLE_OPS = new Set(["cs", "cd", "ov", "sl", "sr", "nxr", "nxl", "adj"]);
const FTS_OPS = new Set(["fts", "plfts", "phfts", "wfts"]);
const ALL_OPS = new Set([...QUANT_OPS, ...SIMPLE_OPS, ...FTS_OPS, "is", "isdistinct", "in"]);

function unquote(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\(.)/g, "$1");
	}
	return value;
}

/** `(a,b,"c,d")` -> ["a","b","c,d"] */
export function parseList(text: string, context: string): string[] {
	if (!text.startsWith("(") || !text.endsWith(")")) throw queryParamError("\"failed to parse filter (" + context + ")\"", `expected a list like (a,b) in ${context}`);
	const inner = text.slice(1, -1);
	if (inner === "") return [];
	return splitTopLevel(inner).map(unquote);
}

/**
 * Parse `[not.]op[(quant|config)].value`. In a logic tree (or=/and=), values
 * may be double-quoted, so `inTree` unquotes them like PostgREST's
 * pLogicSingleVal.
 */
export function parseOperation(text: string, context: string, inTree: boolean): { negate: boolean; operation: Operation } {
	let rest = text;
	let negate = false;
	if (rest.startsWith("not.")) {
		negate = true;
		rest = rest.slice(4);
	}
	const m = /^([a-z]+)(?:\(([A-Za-z0-9_]+)\))?\.([\s\S]*)$/.exec(rest);
	if (!m || !ALL_OPS.has(m[1]!)) {
		const op = /^([^.(]+)/.exec(rest)?.[1] ?? rest;
		if (/^(sl|sr|nxr|nxl|adj|cs|cd|ov|fts|plfts|phfts|wfts|is|in|isdistinct|eq|neq|gt|gte|lt|lte|like|ilike|match|imatch)$/.test(op)) {
			throw queryParamError(`"failed to parse filter (${text})"`, `malformed filter in ${context}`);
		}
		throw queryParamError(`"failed to parse filter (${text})"`, `unknown operator ${JSON.stringify(op)} in ${context}`);
	}
	const op = m[1]!;
	const modifier = m[2] ?? null;
	const raw = m[3]!;
	const value = inTree ? unquote(raw) : raw;
	if (QUANT_OPS.has(op)) {
		if (modifier !== null && modifier !== "any" && modifier !== "all") throw queryParamError(`"failed to parse filter (${text})"`, `unknown quantifier ${modifier}`);
		// A quantified value is an array literal ({a,b}); keep it verbatim.
		return { negate, operation: { op: op as "eq", quant: modifier as Quantifier, value: modifier !== null ? raw : value } };
	}
	if (modifier !== null && !FTS_OPS.has(op)) throw queryParamError(`"failed to parse filter (${text})"`, `${op} takes no modifier`);
	if (SIMPLE_OPS.has(op)) return { negate, operation: { op: op as "cs", value } };
	if (FTS_OPS.has(op)) return { negate, operation: { op: op as "fts", config: modifier, value } };
	if (op === "is") {
		const v = value.toLowerCase();
		if (v !== "null" && v !== "true" && v !== "false" && v !== "unknown") throw queryParamError(`"failed to parse filter (${text})"`, `is accepts null, true, false or unknown, got ${JSON.stringify(value)}`);
		return { negate, operation: { op: "is", value: v } };
	}
	if (op === "isdistinct") return { negate, operation: { op: "isdistinct", value } };
	// in
	return { negate, operation: { op: "in", values: parseList(raw, context) } };
}

/** Parse `(a.eq.1,and(b.gt.2,c.is.null))` (the value of or= / and= / not.or=). */
export function parseLogicTree(op: "and" | "or", negate: boolean, text: string, context: string): LogicTree {
	if (!text.startsWith("(") || !text.endsWith(")")) throw queryParamError(`"failed to parse logic tree (${text})"`, `expected (...) in ${context}`);
	const parts = splitTopLevel(text.slice(1, -1));
	return { kind: "expr", negate, op, children: parts.map((p) => parseLogicItem(p, context)) };
}

function parseLogicItem(text: string, context: string): LogicTree {
	const nested = /^(not\.)?(and|or)(\(.*\))$/.exec(text);
	if (nested) return parseLogicTree(nested[2] as "and" | "or", !!nested[1], nested[3]!, context);
	// field[.json path].[not.]op.value  — the field ends at the first "." that starts an operator.
	const m = /^([A-Za-z_][A-Za-z0-9_]*(?:->>?[A-Za-z0-9_$\- ]+)*)\.(.*)$/.exec(text);
	if (!m) throw queryParamError(`"failed to parse logic tree (${text})"`, `invalid filter in ${context}`);
	const after = m[2]!;
	const opName = /^(?:not\.)?([a-z]+)/.exec(after)?.[1];
	if (!opName || !ALL_OPS.has(opName)) {
		if (/^[A-Za-z_][A-Za-z0-9_]*\./.test(after)) {
			throw new UnsupportedFeatureError("filters on embedded columns inside or()/and() (use referencedTable)", `@phaseo/db: embedded column ${JSON.stringify(text.split(".").slice(0, 2).join("."))} inside a logic tree is not supported`);
		}
		throw queryParamError(`"failed to parse logic tree (${text})"`, `unknown operator in ${JSON.stringify(text)}`);
	}
	const field = parseField(m[1]!, context);
	const { negate, operation } = parseOperation(after, context, true);
	return { kind: "filter", filter: { field, negate, operation } };
}

// ---------------------------------------------------------------- order

export type OrderTerm = { field: Field; direction: "asc" | "desc" | null; nulls: "first" | "last" | null };

export function parseOrder(text: string): OrderTerm[] {
	return splitTopLevel(text).map((term) => {
		if (/\(/.test(term)) throw new UnsupportedFeatureError("order by an embedded resource column (order=rel(col))");
		const m = /^([^.]+)(?:\.(asc|desc))?(?:\.(nullsfirst|nullslast))?$/.exec(term);
		if (!m) throw queryParamError(`"failed to parse order (${text})"`, `invalid order term ${JSON.stringify(term)}`);
		const direction = (m[2] ?? null) as OrderTerm["direction"];
		const nulls = m[3] ? (m[3] === "nullsfirst" ? "first" : "last") : null;
		return { field: parseField(m[1]!, "order"), direction, nulls };
	});
}

export function parseNonNegativeInt(value: string, name: string): number {
	if (!/^\d+$/.test(value)) throw queryParamError(`"failed to parse ${name} parameter (${value})"`, `${name} must be a non-negative integer`);
	return Number(value);
}

/** `"a","b"` or `a,b` (the columns= and on_conflict= parameters). */
export function parseColumnList(text: string, name: string): string[] {
	return splitTopLevel(text).map((c) => {
		const v = unquote(c);
		if (!IDENT.test(v)) {
			if (v.length) throw new UnsupportedFeatureError(`${name} column outside [A-Za-z_][A-Za-z0-9_]*`, `@phaseo/db: ${name} column ${JSON.stringify(v)} is not supported`);
			throw queryParamError(`"failed to parse ${name} parameter (${text})"`, "empty column name");
		}
		return v;
	});
}
