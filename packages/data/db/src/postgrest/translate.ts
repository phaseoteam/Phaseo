/**
 * PostgREST request -> one SQL statement + a function that turns the
 * statement's single result row into PostgREST's HTTP response
 * (status, Content-Range, body). Mirrors PostgREST v12.2's Statements.hs,
 * QueryBuilder.hs and Response.hs.
 */
import type { SqlParam, SqlRow } from "../executor";
import { PostgrestRequestError, requestError, UnsupportedFeatureError } from "../errors";
import { routineOverloads, tableMeta, type RelationshipMetadata, type RoutineMeta } from "../relationships";
import { assertTypeName, quoteIdent, quoteQualified } from "../sql/identifiers";
import { parseColumnList, parseSelect } from "./parse";
import { applyQueryParams, assertNoModifiers, buildReadTree, type ReadNode, referencedRootColumns, restrictRange } from "./plan";
import { countNodeSql, logicSql, newCounter, Params, readNodeSql } from "./sql";

export type Method = "GET" | "HEAD" | "POST" | "PATCH" | "DELETE";
export type QueryKind = "select" | "insert" | "update" | "delete" | "rpc";

export type Preferences = {
	return: "minimal" | "representation" | "headers-only" | null;
	count: "exact" | "planned" | "estimated" | null;
	resolution: "merge-duplicates" | "ignore-duplicates" | null;
	missing: "default" | "null" | null;
	tx: "commit" | "rollback" | null;
	handling: "strict" | "lenient" | null;
	maxAffected: number | null;
	params: string | null;
};

export type CompatRequest = {
	method: Method;
	schema: string;
	/** Table/view name, or function name when `rpc`. */
	target: string;
	rpc: boolean;
	params: Array<[string, string]>;
	prefer: Preferences;
	singular: boolean;
	stripNulls: boolean;
	body: string | null;
};

export type CompatResponse = { status: number; headers: Record<string, string>; body: string | null; rows: number };

export type Translation = {
	kind: QueryKind;
	table: string;
	sql: string;
	params: SqlParam[];
	/** Must run in a transaction so finish() can roll it back (singular / max-affected mutations). */
	needsTransaction: boolean;
	finish(row: SqlRow | undefined): CompatResponse;
};

export type TranslateOptions = { meta: RelationshipMetadata; maxRows: number | null };

export function parsePrefer(header: string | null): Preferences {
	const prefs: Preferences = { return: null, count: null, resolution: null, missing: null, tx: null, handling: null, maxAffected: null, params: null };
	if (!header) return prefs;
	for (const raw of header.split(",")) {
		const part = raw.trim();
		if (!part) continue;
		const [k, v = ""] = part.split("=", 2) as [string, string?];
		switch (k) {
			case "return":
				if (v === "minimal" || v === "representation" || v === "headers-only") prefs.return = v;
				break;
			case "count":
				if (v === "exact" || v === "planned" || v === "estimated") prefs.count = v;
				break;
			case "resolution":
				if (v === "merge-duplicates" || v === "ignore-duplicates") prefs.resolution = v;
				break;
			case "missing":
				if (v === "default" || v === "null") prefs.missing = v;
				break;
			case "tx":
				if (v === "commit" || v === "rollback") prefs.tx = v;
				break;
			case "handling":
				if (v === "strict" || v === "lenient") prefs.handling = v;
				break;
			case "max-affected":
				if (/^\d+$/.test(v)) prefs.maxAffected = Number(v);
				break;
			case "params":
				prefs.params = v;
				break;
			default:
				break;
		}
	}
	return prefs;
}

const STATUS_TEXT: Record<number, string> = {
	200: "OK",
	201: "Created",
	204: "No Content",
	206: "Partial Content",
	300: "Multiple Choices",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	409: "Conflict",
	416: "Requested Range Not Satisfiable",
	500: "Internal Server Error",
	503: "Service Unavailable",
};
export const statusText = (status: number) => STATUS_TEXT[status] ?? "";

function contentRange(lower: number, upper: number, total: number | null): string {
	const range = total !== 0 && lower <= upper ? `${lower}-${upper}` : "*";
	return `${range}/${total === null ? "*" : total}`;
}

const JSON_TYPE = "application/json; charset=utf-8";
const OBJECT_TYPE = "application/vnd.pgrst.object+json; charset=utf-8";

function intOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function singularError(n: number): PostgrestRequestError {
	return requestError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${n} rows`, null);
}

function bodyHandler(singular: boolean, strip: boolean, scalar: "none" | "single" | "set", singleComposite: boolean): string {
	const strp = (s: string) => (strip ? `json_strip_nulls(${s})` : s);
	const col = scalar === "none" ? "_postgrest_t" : "_postgrest_t.pgrst_scalar";
	if (singular || singleComposite || scalar === "single") return `coalesce(${strp(`json_agg(${col})->0`)}, 'null')`;
	return `coalesce(${strp(`json_agg(${col})`)}, '[]')`;
}

function rejectUnsupportedPrefs(req: CompatRequest) {
	if (req.prefer.count === "planned" || req.prefer.count === "estimated") throw new UnsupportedFeatureError(`count: '${req.prefer.count}'`, `@phaseo/db: count '${req.prefer.count}' is not supported; use count: 'exact'`);
	if (req.prefer.tx === "rollback") throw new UnsupportedFeatureError("Prefer: tx=rollback (.rollback())");
	if (req.prefer.missing === "default") throw new UnsupportedFeatureError("Prefer: missing=default (defaultToNull: false)");
	if (req.prefer.params) throw new UnsupportedFeatureError(`Prefer: params=${req.prefer.params}`);
	if (req.prefer.return === "headers-only") throw new UnsupportedFeatureError("Prefer: return=headers-only");
}

const ROOT_SOURCE = { from: '"pgrst_source"', ref: '"pgrst_source"' };

function readStatement(req: CompatRequest, opts: TranslateOptions): Translation {
	const select = req.params.find(([k]) => k === "select")?.[1] ?? "*";
	const ctx = { meta: opts.meta, schema: req.schema };
	const root = buildReadTree(ctx, { relation: { schema: req.schema, name: req.target }, name: req.target }, parseSelect(select));
	applyQueryParams(root, req.params);
	const requestedOffset = root.offset;
	restrictRange(root, opts.maxRows);
	const params = new Params();
	const counter = newCounter();
	const qi = quoteQualified(req.schema, req.target);
	const src = { from: qi, ref: qi };
	const readSql = readNodeSql(root, src, params, counter);
	const counting = req.prefer.count === "exact";
	const countCte = counting ? `, pgrst_source_count AS (${countNodeSql(root, src, params, counter)})` : "";
	const body = req.method === "HEAD" ? "NULL" : bodyHandler(req.singular, req.stripNulls, "none", false);
	const sql =
		`WITH pgrst_source AS ( ${readSql} )${countCte} ` +
		`SELECT ${counting ? "(SELECT pg_catalog.count(*) FROM pgrst_source_count)" : "null::bigint"}::text AS total_result_set, ` +
		`pg_catalog.count(_postgrest_t)::text AS page_total, (${body})::text AS body ` +
		`FROM ( SELECT * FROM pgrst_source ) _postgrest_t`;
	return {
		kind: "select",
		table: req.target,
		sql,
		params: params.values,
		needsTransaction: false,
		finish: (row) => readResponse(req, row, requestedOffset),
	};
}

function readResponse(req: CompatRequest, row: SqlRow | undefined, offset: number): CompatResponse {
	const pageTotal = intOrNull(row?.page_total) ?? 0;
	const total = intOrNull(row?.total_result_set);
	if (req.singular && pageTotal !== 1) throw singularError(pageTotal);
	const upper = offset + pageTotal - 1;
	if (total !== null && offset > total) {
		throw requestError(416, "PGRST103", "Requested range not satisfiable", `An offset of ${offset} was requested, but there are only ${total} rows.`, null);
	}
	const status = total === null ? 200 : 1 + upper - offset < total ? 206 : 200;
	const headers: Record<string, string> = { "content-range": contentRange(offset, upper, total), "content-type": req.singular ? OBJECT_TYPE : JSON_TYPE };
	return { status, headers, body: req.method === "HEAD" ? null : ((row?.body as string | null) ?? null), rows: pageTotal };
}

type ParsedBody = { kind: "object" | "array"; keys: string[] };

function parseJsonBody(body: string | null): ParsedBody {
	const text = body ?? "";
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw requestError(400, "PGRST102", "Empty or invalid json", null, null);
	}
	if (Array.isArray(value)) {
		const keys: string[] = [];
		const seen = new Set<string>();
		for (const item of value) {
			if (!item || typeof item !== "object" || Array.isArray(item)) throw requestError(400, "PGRST102", "All object keys must match", null, null);
			for (const k of Object.keys(item)) if (!seen.has(k)) seen.add(k), keys.push(k);
		}
		return { kind: "array", keys };
	}
	if (value && typeof value === "object") return { kind: "object", keys: Object.keys(value) };
	throw requestError(400, "PGRST102", "Empty or invalid json", null, null);
}

function bodyColumns(body: ParsedBody): string[] {
	for (const k of body.keys) quoteIdent(k);
	return body.keys;
}

/** PostgREST fromJsonBodyF, using the table's row type instead of schema-cache column types. */
function jsonBodySql(qi: string, columns: string[], body: ParsedBody, payload: string, includeSelect: boolean): string {
	const cols = columns.map(quoteIdent);
	const populated =
		columns.length === 0
			? body.kind === "object"
				? "(values(1)) _"
				: "json_array_elements(pgrst_payload.json_data) _"
			: `${body.kind === "object" ? "json_populate_record" : "json_populate_recordset"}(NULL::${qi}, pgrst_payload.json_data) AS _`;
	return (
		(includeSelect ? `SELECT ${cols.map((c) => `"pgrst_body".${c}`).join(", ")} ` : "") +
		`FROM (SELECT ${payload}::json AS json_data) pgrst_payload, ` +
		`LATERAL (SELECT ${cols.join(", ")} FROM ${populated}) pgrst_body`
	);
}

function returningSql(qi: string, root: ReadNode, representation: boolean): string {
	if (!representation) return "RETURNING 1";
	const cols = referencedRootColumns(root);
	if (cols === "*") return `RETURNING ${qi}.*`;
	return `RETURNING ${cols.map((c) => `${qi}.${quoteIdent(c)}`).join(", ")}`;
}

const INSERTED_GUC = "nullif(current_setting('pgrst.inserted', true), '')";
const insertedCounter = (add: boolean) =>
	`set_config('pgrst.inserted', (coalesce(${INSERTED_GUC}::int, 0) ${add ? "+" : "-"} 1)::text, true) <> '${add ? "0" : "-1"}'`;

function mutationStatement(req: CompatRequest, opts: TranslateOptions): Translation {
	rejectUnsupportedPrefs(req);
	const kind: QueryKind = req.method === "POST" ? "insert" : req.method === "PATCH" ? "update" : "delete";
	const selectParam = req.params.find(([k]) => k === "select")?.[1];
	const representation = req.prefer.return === "representation";
	const ctx = { meta: opts.meta, schema: req.schema };
	const relation = { schema: req.schema, name: req.target };
	const root = buildReadTree(ctx, { relation, name: req.target }, parseSelect(representation ? (selectParam ?? "*") : "*"));
	applyQueryParams(root, req.params);
	assertNoModifiers(root, `${kind} (limited updates/deletes)`);
	const qi = quoteQualified(req.schema, req.target);
	const params = new Params();
	const counter = newCounter();
	const columnsParam = req.params.find(([k]) => k === "columns")?.[1];
	let mutation: string;
	let upsertMerge = false;
	if (kind === "insert") {
		if (root.where.length) throw new UnsupportedFeatureError("filters on insert (PUT-style conditions)");
		const body = parseJsonBody(req.body);
		const columns = columnsParam ? parseColumnList(columnsParam, "columns") : bodyColumns(body);
		const payload = params.add(req.body);
		let onConflict = "";
		if (req.prefer.resolution) {
			const conflictParam = req.params.find(([k]) => k === "on_conflict")?.[1];
			let conflictCols: string[];
			if (conflictParam !== undefined) conflictCols = parseColumnList(conflictParam, "on_conflict");
			else {
				const table = tableMeta(opts.meta, relation);
				if (!table) throw new UnsupportedFeatureError("upsert without onConflict on a table missing from relationships.json", `@phaseo/db: upsert into ${req.schema}.${req.target} needs onConflict, or the table's primary key in relationships.json`);
				conflictCols = table.primaryKey;
			}
			if (conflictCols.length) {
				upsertMerge = req.prefer.resolution === "merge-duplicates";
				const doPart =
					req.prefer.resolution === "ignore-duplicates" || columns.length === 0
						? "DO NOTHING"
						: `DO UPDATE SET ${columns.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")} WHERE ${insertedCounter(false)}`;
				onConflict = ` ON CONFLICT(${conflictCols.map(quoteIdent).join(", ")}) ${doPart}`;
			}
		}
		mutation =
			`INSERT INTO ${qi}${columns.length ? `(${columns.map(quoteIdent).join(", ")})` : ""} ` +
			jsonBodySql(qi, columns, body, payload, true) +
			(upsertMerge ? ` WHERE ${insertedCounter(true)}` : "") +
			onConflict +
			` ${returningSql(qi, root, representation)}`;
	} else if (kind === "update") {
		const body = parseJsonBody(req.body);
		if (body.kind !== "object") throw requestError(400, "PGRST102", "Empty or invalid json", "PATCH expects a JSON object", null);
		const columns = columnsParam ? parseColumnList(columnsParam, "columns") : bodyColumns(body);
		const where = root.where.map((w) => (w.kind === "nullEmbed" ? unsupportedNullEmbed() : logicOn(qi, w, params)));
		if (columns.length === 0) {
			const ret = representation ? (referencedRootColumns(root) === "*" ? `${qi}.*` : (referencedRootColumns(root) as string[]).map((c) => `${qi}.${quoteIdent(c)}`).join(", ")) : "NULL";
			mutation = `SELECT ${ret} FROM ${qi} WHERE false`;
		} else {
			const payload = params.add(req.body);
			mutation =
				`UPDATE ${qi} SET ${columns.map((c) => `${quoteIdent(c)} = "pgrst_body".${quoteIdent(c)}`).join(", ")} ` +
				jsonBodySql(qi, columns, body, payload, false) +
				(where.length ? ` WHERE ${where.join(" AND ")}` : "") +
				` ${returningSql(qi, root, representation)}`;
		}
	} else {
		const where = root.where.map((w) => (w.kind === "nullEmbed" ? unsupportedNullEmbed() : logicOn(qi, w, params)));
		mutation = `DELETE FROM ${qi}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ${returningSql(qi, root, representation)}`;
	}
	root.where = [];
	const selectQuery = representation ? readNodeSql(root, ROOT_SOURCE, params, counter, [], { includeWhere: false, includeOrderAndRange: true }) : "SELECT * FROM pgrst_source";
	const body = representation ? bodyHandler(req.singular, req.stripNulls, "none", false) : "NULL";
	const sql =
		`WITH pgrst_source AS ( ${mutation} ) ` +
		`SELECT pg_catalog.count(_postgrest_t)::text AS page_total, (${body})::text AS body, ` +
		`${upsertMerge ? `${INSERTED_GUC}::int::text` : "NULL::text"} AS response_inserted ` +
		`FROM ( ${selectQuery} ) _postgrest_t`;
	const strictMax = req.prefer.handling === "strict" && req.prefer.maxAffected !== null && kind !== "insert" ? req.prefer.maxAffected : null;
	return {
		kind,
		table: req.target,
		sql,
		params: params.values,
		needsTransaction: req.singular || strictMax !== null,
		finish(row) {
			const n = intOrNull(row?.page_total) ?? 0;
			if (req.singular && n !== 1) throw singularError(n);
			if (strictMax !== null && n > strictMax) {
				throw requestError(400, "PGRST124", "Query result exceeds max-affected preference constraint", `The query affects ${n} rows`, null);
			}
			const total = req.prefer.count === "exact" ? n : null;
			const headers: Record<string, string> = { "content-range": kind === "update" ? contentRange(0, n - 1, total) : contentRange(1, 0, total) };
			const resBody = representation ? ((row?.body as string | null) ?? null) : null;
			if (representation) headers["content-type"] = req.singular ? OBJECT_TYPE : JSON_TYPE;
			let status: number;
			if (kind === "insert") {
				const inserted = intOrNull(row?.response_inserted);
				status = upsertMerge && inserted !== null && inserted <= 0 ? 200 : 201;
			} else status = representation ? 200 : 204;
			return { status, headers, body: resBody, rows: n };
		},
	};
}

function unsupportedNullEmbed(): never {
	throw new UnsupportedFeatureError("is.null filters on embedded resources in update/delete");
}

function logicOn(qi: string, w: Exclude<ReadNode["where"][number], { kind: "nullEmbed" }>, params: Params) {
	return logicSql(qi, w, params);
}

// ---------------------------------------------------------------- RPC

function resolveRoutine(req: CompatRequest, opts: TranslateOptions, keys: string[]): RoutineMeta {
	const overloads = routineOverloads(opts.meta, req.schema, req.target);
	const provided = new Set(keys);
	const matches = overloads.filter((r) => keys.every((k) => r.args.some((a) => a.name === k)) && r.args.every((a) => a.hasDefault || provided.has(a.name)));
	if (matches.length === 1) return matches[0]!;
	const sorted = [...keys].sort();
	if (matches.length === 0) {
		throw requestError(
			404,
			"PGRST202",
			`Could not find the function ${req.schema}.${req.target}${sorted.length ? `(${sorted.join(", ")})` : " without parameters"} in the schema cache`,
			`Searched for the function ${req.schema}.${req.target}${sorted.length ? ` with parameter${sorted.length > 1 ? "s" : ""} ${sorted.join(", ")}` : " without parameters"} or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`,
			overloads.length ? null : "@phaseo/db resolves functions from relationships.json; regenerate it if this function is new.",
		);
	}
	throw requestError(
		300,
		"PGRST203",
		`Could not choose the best candidate function between: ${matches.map((m) => `${req.schema}.${req.target}(${m.args.map((a) => `${a.name} => ${a.type}`).join(", ")})`).join(", ")}`,
		null,
		"Try renaming the parameters or the function itself in the database so function overloading can be resolved",
	);
}

function rpcStatement(req: CompatRequest, opts: TranslateOptions): Translation {
	rejectUnsupportedPrefs(req);
	let argsJson: string;
	let keys: string[];
	const overloads = routineOverloads(opts.meta, req.schema, req.target);
	const argNames = new Set(overloads.flatMap((o) => o.args.map((a) => a.name)));
	if (req.method === "POST") {
		const text = req.body === null || req.body === "" ? "{}" : req.body;
		let value: unknown;
		try {
			value = JSON.parse(text);
		} catch {
			throw requestError(400, "PGRST102", "Empty or invalid json", null, null);
		}
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new UnsupportedFeatureError("RPC with a JSON array body (bulk calls)");
		keys = Object.keys(value);
		argsJson = text;
	} else {
		const args: Record<string, string> = {};
		for (const [k, v] of req.params) if (argNames.has(k)) args[k] = v;
		keys = Object.keys(args);
		argsJson = JSON.stringify(args);
	}
	const routine = resolveRoutine(req, opts, keys);
	if (routine.returnKind === "record") throw new UnsupportedFeatureError("RPC returning an untyped record (no OUT parameters)");
	const scalar = routine.returnKind === "scalar" || routine.returnKind === "void";
	const fn = quoteQualified(req.schema, req.target);
	const params = new Params();
	const used = routine.args.filter((a) => keys.includes(a.name));
	const callArgs = used.map((a) => `${a.variadic ? "VARIADIC " : ""}${quoteIdent(a.name)} := pgrst_body.${quoteIdent(a.name)}`).join(", ");
	const callIt = scalar ? `(SELECT ${fn}(${callArgs}) pgrst_scalar) pgrst_call` : `${fn}(${callArgs}) pgrst_call`;
	let from: string;
	if (used.length) {
		const payload = params.add(argsJson);
		from =
			`FROM (SELECT ${payload}::json AS json_data) pgrst_payload, ` +
			`LATERAL (SELECT ${used.map((a) => quoteIdent(a.name)).join(", ")} FROM json_to_record(pgrst_payload.json_data) AS _(${used.map((a) => `${quoteIdent(a.name)} ${assertTypeName(a.type)}`).join(", ")})) pgrst_body, ` +
			`LATERAL ${callIt}`;
	} else from = `FROM ${callIt}`;
	const callSql = `SELECT ${scalar ? "pgrst_call.pgrst_scalar" : "pgrst_call.*"} ${from}`;

	const ctx = { meta: opts.meta, schema: req.schema };
	const relation = routine.returnRelation ? { schema: routine.returnRelation.split(".")[0]!, name: routine.returnRelation.split(".").slice(1).join(".") } : null;
	const selectParam = req.params.find(([k]) => k === "select")?.[1] ?? "*";
	const root = buildReadTree(ctx, { relation, name: req.target }, parseSelect(scalar ? "*" : selectParam));
	applyQueryParams(root, req.params, (k) => req.method !== "POST" && argNames.has(k));
	const requestedOffset = root.offset;
	restrictRange(root, opts.maxRows);
	const counter = newCounter();
	const selectQuery = readNodeSql(root, ROOT_SOURCE, params, counter);
	const counting = req.prefer.count === "exact";
	const countCte = counting ? `, pgrst_source_count AS (${countNodeSql(root, ROOT_SOURCE, params, counter)})` : "";
	const scalarMode = !scalar ? "none" : routine.returnsSet ? "set" : "single";
	const headOnly = req.method === "HEAD" || routine.returnKind === "void" || req.prefer.return === "minimal";
	const body = headOnly ? "NULL" : bodyHandler(req.singular, req.stripNulls, scalarMode, !scalar && !routine.returnsSet);
	const sql =
		`WITH pgrst_source AS (${callSql})${countCte} ` +
		`SELECT ${counting ? "(SELECT pg_catalog.count(*) FROM pgrst_source_count)" : "null::bigint"}::text AS total_result_set, ` +
		`${routine.returnsSet ? "pg_catalog.count(_postgrest_t)" : "1"}::text AS page_total, (${body})::text AS body ` +
		`FROM (${selectQuery}) _postgrest_t`;
	const strictMax = req.prefer.handling === "strict" && req.prefer.maxAffected !== null ? req.prefer.maxAffected : null;
	return {
		kind: "rpc",
		table: req.target,
		sql,
		params: params.values,
		needsTransaction: strictMax !== null,
		finish(row) {
			const pageTotal = intOrNull(row?.page_total) ?? 0;
			const total = intOrNull(row?.total_result_set);
			const upper = requestedOffset + pageTotal - 1;
			let status = total === null ? 200 : 1 + upper - requestedOffset < total ? 206 : 200;
			if (total !== null && requestedOffset > total) {
				throw requestError(416, "PGRST103", "Requested range not satisfiable", `An offset of ${requestedOffset} was requested, but there are only ${total} rows.`, null);
			}
			if (req.singular && pageTotal !== 1) throw singularError(pageTotal);
			if (strictMax !== null && pageTotal > strictMax) {
				throw requestError(400, "PGRST124", "Query result exceeds max-affected preference constraint", `The query affects ${pageTotal} rows`, null);
			}
			const headers: Record<string, string> = { "content-range": contentRange(requestedOffset, upper, total) };
			if (routine.returnKind === "void") return { status: 204, headers, body: null, rows: pageTotal };
			headers["content-type"] = req.singular ? OBJECT_TYPE : JSON_TYPE;
			if (headOnly) status = req.method === "HEAD" ? status : 204;
			return { status, headers, body: headOnly ? null : ((row?.body as string | null) ?? null), rows: pageTotal };
		},
	};
}

export function translate(req: CompatRequest, opts: TranslateOptions): Translation {
	if (req.rpc) {
		if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") {
			throw requestError(405, "PGRST101", `Cannot use the ${req.method} method on RPC`, null, null);
		}
		return rpcStatement(req, opts);
	}
	if (req.method === "GET" || req.method === "HEAD") {
		rejectUnsupportedPrefs(req);
		return readStatement(req, opts);
	}
	return mutationStatement(req, opts);
}
