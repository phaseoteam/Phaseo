/**
 * SQL generation for read plans, following PostgREST v12.2's QueryBuilder /
 * SqlFragment: LATERAL joins for embeds, `row_to_json(x.*)::jsonb` for
 * to-one, `json_agg(x)::jsonb` for to-many, `= ANY('{..}')` for in, and every
 * request value sent as an untyped parameter.
 */
import type { SqlParam } from "../executor";
import { UnsupportedFeatureError } from "../errors";
import { assertCastName, quoteIdent, quoteQualified } from "../sql/identifiers";
import type { Field, Filter, LogicTree, OrderTerm } from "./parse";
import type { NodeFilter, ReadNode } from "./plan";

export class Params {
	readonly values: SqlParam[] = [];
	add(value: SqlParam): string {
		this.values.push(value);
		return `$${this.values.length}`;
	}
}

/** PostgREST pgBuildArrayLiteral: every element double-quoted, `\` and `"` escaped. */
export function arrayLiteral(values: string[]): string {
	return `{${values.map((v) => `"${v.split("\u0000")[0]!.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

// JSON-path keys already passed parse.ts's [A-Za-z0-9_$\- ] check, so they
// contain no quotes and can be used as output names.
function quoteJsonKeyAlias(key: string): string {
	if (!/^[A-Za-z0-9_$\- ]+$/.test(key)) throw new UnsupportedFeatureError("unusual JSON key alias");
	return `"${key}"`;
}

export function fieldSql(ref: string, field: Field, params: Params): string {
	let sql = `${ref}.${quoteIdent(field.name)}`;
	for (const step of field.jsonPath) {
		sql += step.index ? `${step.arrow}${params.add(step.key)}::int` : `${step.arrow}${params.add(step.key)}`;
	}
	return sql;
}

const QUANT_SQL: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike", match: "~", imatch: "~*" };
const SIMPLE_SQL: Record<string, string> = { cs: "@>", cd: "<@", ov: "&&", sl: "<<", sr: ">>", nxr: "&<", nxl: "&>", adj: "-|-" };
const FTS_SQL: Record<string, string> = { fts: "to_tsquery", plfts: "plainto_tsquery", phfts: "phraseto_tsquery", wfts: "websearch_to_tsquery" };

const star = (v: string) => v.replace(/\*/g, "%");

export function filterSql(ref: string, filter: Filter, params: Params): string {
	const lhs = fieldSql(ref, filter.field, params);
	const o = filter.operation;
	let sql: string;
	switch (o.op) {
		case "eq":
		case "neq":
		case "gt":
		case "gte":
		case "lt":
		case "lte":
		case "like":
		case "ilike":
		case "match":
		case "imatch": {
			if (o.op === "neq" && o.quant) throw new UnsupportedFeatureError("neq(any|all)");
			const value = o.op === "like" || o.op === "ilike" ? star(o.value) : o.value;
			const p = params.add(value);
			sql = `${lhs} ${QUANT_SQL[o.op]} ${o.quant === "any" ? `ANY(${p})` : o.quant === "all" ? `ALL(${p})` : p}`;
			break;
		}
		case "cs":
		case "cd":
		case "ov":
		case "sl":
		case "sr":
		case "nxr":
		case "nxl":
		case "adj":
			sql = `${lhs} ${SIMPLE_SQL[o.op]} ${params.add(o.value)}`;
			break;
		case "is":
			sql = `${lhs} IS ${o.value.toUpperCase()}`;
			break;
		case "isdistinct":
			sql = `${lhs} IS DISTINCT FROM ${params.add(o.value)}`;
			break;
		case "in":
			sql = `${lhs} = ANY (${params.add(arrayLiteral(o.values))})`;
			break;
		case "fts":
		case "plfts":
		case "phfts":
		case "wfts":
			sql = `${lhs} @@ ${FTS_SQL[o.op]}(${o.config !== null ? `${params.add(o.config)}, ` : ""}${params.add(o.value)})`;
			break;
	}
	return filter.negate ? `NOT (${sql})` : sql;
}

export function logicSql(ref: string, tree: LogicTree, params: Params): string {
	if (tree.kind === "filter") return filterSql(ref, tree.filter, params);
	const inner = tree.children.map((c) => logicSql(ref, c, params)).join(tree.op === "and" ? " AND " : " OR ");
	return `${tree.negate ? "NOT " : ""}(${inner})`;
}

export function orderSql(ref: string, terms: OrderTerm[], params: Params): string {
	if (!terms.length) return "";
	return `ORDER BY ${terms
		.map((t) => `${fieldSql(ref, t.field, params)}${t.direction ? ` ${t.direction.toUpperCase()}` : ""}${t.nulls ? ` NULLS ${t.nulls.toUpperCase()}` : ""}`)
		.join(", ")}`;
}

export function limitOffsetSql(node: Pick<ReadNode, "limit" | "offset">, params: Params): string {
	if (node.limit === null && node.offset === 0) return "";
	return `LIMIT ${node.limit === null ? "ALL" : params.add(String(node.limit))} OFFSET ${params.add(String(node.offset))}`;
}

/** How a node's rows are reached in SQL. */
export type NodeSource = { from: string; ref: string };

type Counter = { n: number };

type EmbedSql = { from: string; ref: string; junctionRef: string | null; aggAlias: string };

function embedSource(child: ReadNode, counter: Counter): EmbedSql {
	const rel = child.rel!;
	const n = ++counter.n;
	const alias = `pgrst_${n}_${rel.target.name}`;
	const ref = quoteIdent(alias);
	let from = `${quoteQualified(rel.target.schema, rel.target.name)} AS ${ref}`;
	let junctionRef: string | null = null;
	if (rel.junction) {
		junctionRef = quoteIdent(`pgrst_${n}_${rel.junction.table.name}`);
		from += `, ${quoteQualified(rel.junction.table.schema, rel.junction.table.name)} AS ${junctionRef}`;
	}
	return { from, ref, junctionRef, aggAlias: quoteIdent(`pgrst_agg_${n}`) };
}

function joinConditions(child: ReadNode, parentRef: string, src: EmbedSql): string[] {
	const rel = child.rel!;
	if (rel.junction) {
		return [
			...rel.junction.targetColumns.map(([jc, tc]) => `${src.junctionRef}.${quoteIdent(jc)} = ${src.ref}.${quoteIdent(tc)}`),
			...rel.junction.originColumns.map(([jc, oc]) => `${src.junctionRef}.${quoteIdent(jc)} = ${parentRef}.${quoteIdent(oc)}`),
		];
	}
	return rel.columns.map(([oc, tc]) => `${src.ref}.${quoteIdent(tc)} = ${parentRef}.${quoteIdent(oc)}`);
}

function selectFieldSql(ref: string, f: ReadNode["fields"][number], params: Params): string {
	if (f.kind === "star") return `${ref}.*`;
	let expr = fieldSql(ref, f.field, params);
	if (f.cast) expr = `CAST( ${expr} AS ${assertCastName(f.cast)} )`;
	let alias = f.alias ? quoteIdent(f.alias) : null;
	if (!alias && f.field.jsonPath.length) {
		const last = f.field.jsonPath[f.field.jsonPath.length - 1]!;
		if (!last.index) alias = quoteJsonKeyAlias(last.key);
	}
	return alias ? `${expr} AS ${alias}` : expr;
}

type NodeSqlOptions = { includeWhere: boolean; includeOrderAndRange: boolean };

/**
 * `SELECT ... FROM ... [LATERAL joins] WHERE ... ORDER BY ... LIMIT ...` for
 * one node (PostgREST readPlanToQuery). Embeds are rendered recursively and
 * correlated to `source.ref`.
 */
export function readNodeSql(node: ReadNode, source: NodeSource, params: Params, counter: Counter, extraWhere: string[] = [], opts: NodeSqlOptions = { includeWhere: true, includeOrderAndRange: true }): string {
	const selects = node.fields.map((f) => selectFieldSql(source.ref, f, params));
	const joins: string[] = [];
	const embedSources = new Map<ReadNode, EmbedSql>();
	for (const child of node.embeds) {
		const src = embedSource(child, counter);
		embedSources.set(child, src);
		const sub = readNodeSql(child, { from: src.from, ref: src.ref }, params, counter, joinConditions(child, source.ref, src));
		const kind = child.joinType === "inner" ? "INNER" : "LEFT";
		if (child.rel!.toOne) {
			selects.push(`row_to_json(${src.aggAlias}.*)::jsonb AS ${quoteIdent(child.selName)}`);
			joins.push(`${kind} JOIN LATERAL ( ${sub} ) AS ${src.aggAlias} ON TRUE`);
		} else {
			selects.push(`COALESCE( ${src.aggAlias}.${src.aggAlias}, '[]') AS ${quoteIdent(child.selName)}`);
			joins.push(
				`${kind} JOIN LATERAL ( SELECT json_agg(${src.aggAlias})::jsonb AS ${src.aggAlias} FROM (${sub} ) AS ${src.aggAlias} ) AS ${src.aggAlias} ON ${child.joinType === "inner" ? `${src.aggAlias} IS NOT NULL` : "TRUE"}`,
			);
		}
	}
	const where = [...(opts.includeWhere ? node.where.map((w) => nodeFilterSql(source.ref, w, params, counter)) : []), ...extraWhere];
	return [
		`SELECT ${selects.join(", ")}`,
		`FROM ${source.from}`,
		...joins,
		where.length ? `WHERE ${where.join(" AND ")}` : "",
		opts.includeOrderAndRange ? orderSql(source.ref, node.order, params) : "",
		opts.includeOrderAndRange ? limitOffsetSql(node, params) : "",
	]
		.filter(Boolean)
		.join(" ");
}

function nodeFilterSql(ref: string, w: NodeFilter, params: Params, counter: Counter): string {
	if (w.kind === "nullEmbed") {
		const src = embedSource(w.embed, counter);
		const exists = `EXISTS (${countNodeSql(w.embed, { from: src.from, ref: src.ref }, params, counter, joinConditions(w.embed, ref, src))})`;
		// rel=is.null keeps rows WITHOUT a match; rel=not.is.null keeps rows with one.
		return w.negate ? exists : `NOT ${exists}`;
	}
	return logicSql(ref, w, params);
}

/** PostgREST readPlanToCountQuery: root filters plus EXISTS for !inner embeds. */
export function countNodeSql(node: ReadNode, source: NodeSource, params: Params, counter: Counter, extraWhere: string[] = []): string {
	const where = [...node.where.map((w) => nodeFilterSql(source.ref, w, params, counter)), ...extraWhere];
	for (const child of node.embeds) {
		if (child.joinType !== "inner") continue;
		const src = embedSource(child, counter);
		where.push(`EXISTS (${countNodeSql(child, { from: src.from, ref: src.ref }, params, counter, joinConditions(child, source.ref, src))} )`);
	}
	return `SELECT 1 FROM ${source.from}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
}

export function newCounter(): Counter {
	return { n: 0 };
}
