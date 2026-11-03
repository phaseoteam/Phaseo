/**
 * Builds PostgREST's ReadPlan tree: the root relation, its embedded
 * resources (resolved through static relationship metadata), and the
 * filters / order / range that the query string attaches to each node.
 */
import { queryParamError, requestError, UnsupportedFeatureError } from "../errors";
import { findRelationship, type Qualified, type Relationship, type RelationshipMetadata } from "../relationships";
import {
	type Field,
	type LogicTree,
	type OrderTerm,
	parseField,
	parseLogicTree,
	parseNonNegativeInt,
	parseOperation,
	parseOrder,
	type SelectItem,
} from "./parse";

export type FieldItem = Extract<SelectItem, { kind: "field" }>;

export type NodeFilter = LogicTree | { kind: "nullEmbed"; negate: boolean; embed: ReadNode };

export type ReadNode = {
	/** Table/view whose relationships apply to embeds under this node (null: none, e.g. scalar RPC). */
	relation: Qualified | null;
	/** Name used in the query string: the alias if any, else the relation name. */
	selName: string;
	fields: Array<{ kind: "star" } | FieldItem>;
	embeds: ReadNode[];
	where: NodeFilter[];
	order: OrderTerm[];
	offset: number;
	limit: number | null;
	// Embed-only:
	rel: Relationship | null;
	joinType: "left" | "inner";
	target: string;
};

export type PlanContext = { meta: RelationshipMetadata; schema: string };

function newNode(relation: Qualified | null, selName: string, target: string, rel: Relationship | null, joinType: "left" | "inner"): ReadNode {
	return { relation, selName, target, rel, joinType, fields: [], embeds: [], where: [], order: [], offset: 0, limit: null };
}

function addSelect(ctx: PlanContext, node: ReadNode, items: SelectItem[]) {
	for (const item of items) {
		if (item.kind !== "embed") {
			node.fields.push(item);
			continue;
		}
		if (!node.relation) {
			throw requestError(400, "PGRST200", `Could not find a relationship between '${node.target}' and '${item.target}' in the schema cache`, `The result of '${node.target}' has no relationships to embed.`, null);
		}
		const rel = findRelationship(ctx.meta, ctx.schema, node.relation, item.target, item.hint);
		const child = newNode(rel.target, item.alias ?? item.target, item.target, rel, item.joinType === "inner" ? "inner" : "left");
		if (node.embeds.some((e) => e.selName === child.selName)) {
			throw queryParamError(`"failed to parse select parameter"`, `the embedded resource '${child.selName}' appears twice; give one an alias`);
		}
		addSelect(ctx, child, item.children);
		node.embeds.push(child);
	}
	if (node.fields.length === 0 && node.embeds.length === 0) node.fields.push({ kind: "star" });
}

export function buildReadTree(ctx: PlanContext, root: { relation: Qualified | null; name: string }, select: SelectItem[]): ReadNode {
	const node = newNode(root.relation, root.name, root.name, null, "left");
	addSelect(ctx, node, select);
	return node;
}

/** Walk `a.b.rest` through embed names; returns the node and the remaining key. */
function resolvePath(root: ReadNode, key: string): { node: ReadNode; rest: string; path: string[] } {
	const parts = key.split(".");
	let node = root;
	const path: string[] = [];
	while (parts.length > 1) {
		const next = node.embeds.find((e) => e.selName === parts[0]);
		if (!next) break;
		path.push(parts.shift()!);
		node = next;
	}
	return { node, rest: parts.join("."), path };
}

function notEmbedded(name: string) {
	return requestError(400, "PGRST108", `'${name}' is not an embedded resource in this request`, null, `Verify that '${name}' is included in the 'select' query parameter.`);
}

export const ROOT_ONLY_PARAMS = new Set(["select", "columns", "on_conflict"]);

/**
 * Attach query-string filters/modifiers to the tree. `skip(key)` lets RPC
 * GET requests keep function arguments out of the filters.
 */
export function applyQueryParams(root: ReadNode, params: Array<[string, string]>, skip: (key: string) => boolean = () => false) {
	for (const [key, value] of params) {
		if (ROOT_ONLY_PARAMS.has(key) || skip(key)) continue;
		const { node, rest, path } = resolvePath(root, key);
		switch (rest) {
			case "order":
				node.order.push(...parseOrder(value));
				continue;
			case "limit":
				node.limit = parseNonNegativeInt(value, "limit");
				continue;
			case "offset":
				node.offset = parseNonNegativeInt(value, "offset");
				continue;
			case "or":
			case "and":
				node.where.push(parseLogicTree(rest, false, value, key));
				continue;
			case "not.or":
			case "not.and":
				node.where.push(parseLogicTree(rest.slice(4) as "and" | "or", true, value, key));
				continue;
		}
		if (rest.includes(".")) {
			// e.g. `missing.col=eq.1` where `missing` is not an embed of this request.
			throw notEmbedded([...path, rest.split(".")[0]!].join("."));
		}
		const { negate, operation } = parseOperation(value, key, false);
		const embed = node.embeds.find((e) => e.selName === rest);
		if (embed) {
			if (operation.op !== "is" || operation.value !== "null") {
				throw requestError(400, "PGRST120", `Bad operator on the '${rest}' embedded resource`, "Only is null or not is null filters are allowed on embedded resources", null);
			}
			node.where.push({ kind: "nullEmbed", negate, embed });
			continue;
		}
		const field: Field = parseField(rest, key);
		node.where.push({ kind: "filter", filter: { field, negate, operation } });
	}
}

/** max-rows applies to every read node (PostgREST treeRestrictRange). */
export function restrictRange(node: ReadNode, maxRows: number | null) {
	if (maxRows !== null) node.limit = node.limit === null ? maxRows : Math.min(node.limit, maxRows);
	for (const e of node.embeds) restrictRange(e, maxRows);
}

export function assertNoModifiers(node: ReadNode, what: string) {
	if (node.limit !== null || node.offset > 0) throw new UnsupportedFeatureError(`limit/offset on ${what}`);
}

/** Every column of the root relation the read plan touches (for RETURNING). */
export function referencedRootColumns(node: ReadNode): string[] | "*" {
	if (node.fields.some((f) => f.kind === "star")) return "*";
	const cols = new Set<string>();
	for (const f of node.fields) if (f.kind === "field") cols.add(f.field.name);
	for (const e of node.embeds) {
		const rel = e.rel!;
		if (rel.junction) for (const [, oc] of rel.junction.originColumns) cols.add(oc);
		else for (const [oc] of rel.columns) cols.add(oc);
	}
	for (const o of node.order) cols.add(o.field.name);
	return [...cols];
}

