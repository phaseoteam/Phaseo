import type { Endpoint } from "@core/types";
import type { GateCheck } from "./types";

export type DynamicRouteConditionSource = "body" | "header" | "metadata" | "endpoint" | "model" | "session_id";
export type DynamicRouteConditionOperator = "equals" | "not_equals" | "contains" | "starts_with" | "exists" | "greater_than" | "less_than" | "in";
export type DynamicRouteMode = "balanced" | "price" | "latency" | "throughput";
export type DynamicRouteNodeType = "start" | "condition" | "percentage" | "model" | "rate_limit" | "budget_limit" | "end";

export type DynamicRouteAction = {
	model?: string | null;
	modelFallbacks?: string[] | null;
	routingMode?: DynamicRouteMode | null;
	providerOrder?: string[] | null;
	providerOnly?: string[] | null;
	providerIgnore?: string[] | null;
	allowFallbacks?: boolean | null;
};

export type DynamicRouteNode = {
	id: string;
	type: DynamicRouteNodeType;
	position?: { x: number; y: number } | null;
	data: Record<string, unknown>;
};

export type DynamicRouteEdge = {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
};

export type DynamicRouteRule = {
	id: string;
	name: string;
	enabled: boolean;
	condition: {
		field: "always" | "endpoint" | "model" | "session_id" | "metadata";
		operator: "equals" | "not_equals" | "contains" | "starts_with" | "exists";
		value?: string | null;
		metadataKey?: string | null;
	};
	action: DynamicRouteAction;
};

export type DynamicRouteConfig = {
	schemaVersion?: 2;
	entryNodeId?: string | null;
	nodes?: DynamicRouteNode[] | null;
	edges?: DynamicRouteEdge[] | null;
	cacheAwareRouting?: boolean | null;
	sessionAffinity?: boolean | null;
	defaultAction?: DynamicRouteAction | null;
	rules?: DynamicRouteRule[] | null;
};

export type DynamicRoutePolicy = { id: string; name: string; version: number; config: DynamicRouteConfig };

export type DynamicRouteEvaluation = {
	routeId: string;
	routeName: string;
	routeVersion: number;
	matchedRuleId: string | null;
	matchedRuleName: string | null;
	visitedNodeIds: string[];
	action: DynamicRouteAction;
	cacheAwareRouting: boolean;
	sessionAffinity: boolean;
};

export function suppressDynamicRouteModelOverrides(
	evaluation: DynamicRouteEvaluation,
): DynamicRouteEvaluation {
	return {
		...evaluation,
		action: {
			...evaluation.action,
			model: null,
			modelFallbacks: null,
		},
	};
}

export function selectDynamicRouteContextModels(
	action: DynamicRouteAction,
	requestedOverride?: string | null,
): string[] {
	const primaryModel = cleanString(action.model, 256);
	const fallbackModels = cleanModels(action.modelFallbacks);
	if (
		requestedOverride &&
		(primaryModel === requestedOverride || fallbackModels.includes(requestedOverride))
	) {
		return [requestedOverride];
	}
	return primaryModel ? [primaryModel] : [];
}

const MODES = new Set<DynamicRouteMode>(["balanced", "price", "latency", "throughput"]);
const NODE_TYPES = new Set<DynamicRouteNodeType>(["start", "condition", "percentage", "model", "rate_limit", "budget_limit", "end"]);
const CONDITION_SOURCES = new Set<DynamicRouteConditionSource>(["body", "header", "metadata", "endpoint", "model", "session_id"]);
const CONDITION_OPERATORS = new Set<DynamicRouteConditionOperator>(["equals", "not_equals", "contains", "starts_with", "exists", "greater_than", "less_than", "in"]);
const LEGACY_FIELDS = new Set(["always", "endpoint", "model", "session_id", "metadata"]);
const LEGACY_OPERATORS = new Set(["equals", "not_equals", "contains", "starts_with", "exists"]);

function cleanString(value: unknown, max = 256): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : null;
}

function cleanProviders(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => cleanString(item, 128)).filter((item): item is string => Boolean(item)))].slice(0, 64);
}

function cleanModels(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => cleanString(item, 256)).filter((item): item is string => Boolean(item)))].slice(0, 8);
}

function normalizeAction(value: unknown): DynamicRouteAction {
	if (!value || typeof value !== "object") return {};
	const raw = value as Record<string, unknown>;
	const mode = cleanString(raw.routingMode ?? raw.routing_mode, 32);
	const model = cleanString(raw.model, 256);
	return {
		...(model ? { model } : {}),
		...(cleanModels(raw.modelFallbacks ?? raw.model_fallbacks).length ? { modelFallbacks: cleanModels(raw.modelFallbacks ?? raw.model_fallbacks) } : {}),
		...(mode && MODES.has(mode as DynamicRouteMode) ? { routingMode: mode as DynamicRouteMode } : {}),
		...(cleanProviders(raw.providerOrder ?? raw.provider_order).length ? { providerOrder: cleanProviders(raw.providerOrder ?? raw.provider_order) } : {}),
		...(cleanProviders(raw.providerOnly ?? raw.provider_only).length ? { providerOnly: cleanProviders(raw.providerOnly ?? raw.provider_only) } : {}),
		...(cleanProviders(raw.providerIgnore ?? raw.provider_ignore).length ? { providerIgnore: cleanProviders(raw.providerIgnore ?? raw.provider_ignore) } : {}),
		...(typeof (raw.allowFallbacks ?? raw.allow_fallbacks) === "boolean" ? { allowFallbacks: Boolean(raw.allowFallbacks ?? raw.allow_fallbacks) } : {}),
	};
}

function finiteCoordinate(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(-10_000, Math.min(10_000, number)) : 0;
}

function normalizeGraph(raw: Record<string, unknown>): Pick<DynamicRouteConfig, "schemaVersion" | "entryNodeId" | "nodes" | "edges"> {
	const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
	const nodes: DynamicRouteNode[] = [];
	for (const entry of rawNodes.slice(0, 64)) {
		if (!entry || typeof entry !== "object") continue;
		const node = entry as Record<string, unknown>;
		const id = cleanString(node.id, 80);
		const type = cleanString(node.type, 32) as DynamicRouteNodeType | null;
		if (!id || !type || !NODE_TYPES.has(type)) continue;
		const position = node.position && typeof node.position === "object" ? node.position as Record<string, unknown> : null;
		const data = node.data && typeof node.data === "object" && !Array.isArray(node.data) ? node.data as Record<string, unknown> : {};
		nodes.push({ id, type, position: position ? { x: finiteCoordinate(position.x), y: finiteCoordinate(position.y) } : null, data });
	}
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges: DynamicRouteEdge[] = [];
	const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
	for (const entry of rawEdges.slice(0, 128)) {
		if (!entry || typeof entry !== "object") continue;
		const edge = entry as Record<string, unknown>;
		const source = cleanString(edge.source, 80);
		const target = cleanString(edge.target, 80);
		if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
		edges.push({ id: cleanString(edge.id, 100) ?? `${source}-${target}-${edges.length}`, source, target, sourceHandle: cleanString(edge.sourceHandle ?? edge.source_handle, 80) });
	}
	const requestedEntry = cleanString(raw.entryNodeId ?? raw.entry_node_id, 80);
	const entryNodeId = requestedEntry && nodeIds.has(requestedEntry) ? requestedEntry : nodes.find((node) => node.type === "start")?.id ?? nodes[0]?.id ?? null;
	return { schemaVersion: 2, entryNodeId, nodes, edges };
}

export function normalizeDynamicRouteConfig(value: unknown): DynamicRouteConfig {
	const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const cacheAwareRouting = raw.cacheAwareRouting ?? raw.cache_aware_routing;
	const sessionAffinity = raw.sessionAffinity ?? raw.session_affinity;
	const graph = normalizeGraph(raw);
	const rules: DynamicRouteRule[] = [];
	for (const [index, entry] of (Array.isArray(raw.rules) ? raw.rules : []).slice(0, 32).entries()) {
		if (!entry || typeof entry !== "object") continue;
		const rule = entry as Record<string, unknown>;
		const condition = rule.condition && typeof rule.condition === "object" ? rule.condition as Record<string, unknown> : {};
		const field = cleanString(condition.field, 32) ?? "always";
		const operator = cleanString(condition.operator, 32) ?? (field === "always" ? "exists" : "equals");
		if (!LEGACY_FIELDS.has(field) || !LEGACY_OPERATORS.has(operator)) continue;
		rules.push({
			id: cleanString(rule.id, 80) ?? `rule-${index + 1}`,
			name: cleanString(rule.name, 120) ?? `Rule ${index + 1}`,
			enabled: rule.enabled !== false,
			condition: { field: field as DynamicRouteRule["condition"]["field"], operator: operator as DynamicRouteRule["condition"]["operator"], value: cleanString(condition.value, 512), metadataKey: cleanString(condition.metadataKey ?? condition.metadata_key, 128) },
			action: normalizeAction(rule.action),
		});
	}
	return {
		...(graph.nodes?.length ? graph : {}),
		cacheAwareRouting: typeof cacheAwareRouting === "boolean" ? cacheAwareRouting : true,
		sessionAffinity: typeof sessionAffinity === "boolean" ? sessionAffinity : true,
		defaultAction: normalizeAction(raw.defaultAction ?? raw.default_action),
		rules,
	};
}

function getPath(value: unknown, path: string | null): unknown {
	if (!path) return value;
	let current = value;
	for (const segment of path.split(".").filter(Boolean).slice(0, 12)) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function headerValue(headers: Headers | Record<string, string> | undefined, name: string | null): string | null {
	if (!headers || !name) return null;
	if (/authorization|cookie|secret|password|token|api[-_]?key/i.test(name) ||
		/^(?:x-(?:phaseo|aistats|control|internal)-|cf-access-)/i.test(name)) return null;
	if (headers instanceof Headers) return headers.get(name);
	const target = name.toLowerCase();
	const match = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
	return match?.[1] ?? null;
}

function conditionInput(data: Record<string, unknown>, args: EvaluationArgs): unknown {
	const source = cleanString(data.source ?? data.field, 32) as DynamicRouteConditionSource | null;
	const path = cleanString(data.path ?? data.key ?? data.metadataKey, 256);
	if (source === "body") return getPath(args.body, path);
	if (source === "header") return headerValue(args.headers, path);
	if (source === "metadata") return getPath(args.body?.metadata, path);
	if (source === "endpoint") return args.endpoint;
	if (source === "model") return args.model;
	if (source === "session_id") return args.body?.session_id ?? args.body?.sessionId ?? null;
	return undefined;
}

function matches(data: Record<string, unknown>, args: EvaluationArgs): boolean {
	const source = cleanString(data.source ?? data.field, 32) as DynamicRouteConditionSource | null;
	const operator = cleanString(data.operator, 32) as DynamicRouteConditionOperator | null;
	if (!source || !CONDITION_SOURCES.has(source) || !operator || !CONDITION_OPERATORS.has(operator)) return false;
	const input = conditionInput(data, args);
	if (operator === "exists") return input !== null && input !== undefined && String(input).length > 0;
	const expected = data.value;
	if (operator === "greater_than" || operator === "less_than") {
		const actualNumber = Number(input);
		const expectedNumber = Number(expected);
		return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && (operator === "greater_than" ? actualNumber > expectedNumber : actualNumber < expectedNumber);
	}
	const actualText = String(input ?? "").toLowerCase();
	if (operator === "in") {
		const values = Array.isArray(expected) ? expected : String(expected ?? "").split(",");
		return values.map((item) => String(item).trim().toLowerCase()).includes(actualText);
	}
	const expectedText = String(expected ?? "").toLowerCase();
	if (operator === "equals") return actualText === expectedText;
	if (operator === "not_equals") return actualText !== expectedText;
	if (operator === "contains") return actualText.includes(expectedText);
	return actualText.startsWith(expectedText);
}

function stablePercent(seed: string): number {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 100;
}

function selectedPercentageHandle(node: DynamicRouteNode, args: EvaluationArgs): string | null {
	const branches = Array.isArray(node.data.branches) ? node.data.branches : [];
	const seed = String(args.body?.session_id ?? args.body?.sessionId ?? args.body?.prompt_cache_key ?? args.requestId ?? "anonymous");
	const point = stablePercent(`${args.policy.id}:${node.id}:${seed}`);
	let cursor = 0;
	for (const [index, raw] of branches.slice(0, 10).entries()) {
		const branch = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
		cursor += Math.max(0, Math.min(100, Number(branch.percentage) || 0));
		if (point < cursor) return cleanString(branch.id, 80) ?? `branch-${index + 1}`;
	}
	return cleanString((branches[branches.length - 1] as any)?.id, 80);
}

function limitExceeded(node: DynamicRouteNode, usage: GateCheck | null | undefined): boolean {
	const window = cleanString(node.data.window, 16) as "daily" | "weekly" | "monthly" | null;
	if (!window) return false;
	const bucket = usage?.buckets?.[window];
	if (!bucket) return false;
	if (node.type === "rate_limit") return Number(bucket.requestsUsed) >= Math.max(0, Number(node.data.maxRequests) || 0);
	const maxCostUsd = Math.max(0, Number(node.data.maxCostUsd) || 0);
	return Number(bucket.costUsedNanos) >= maxCostUsd * 1_000_000_000;
}

type EvaluationArgs = { policy: DynamicRoutePolicy; endpoint: Endpoint; model: string; body: any; headers?: Headers | Record<string, string>; requestId?: string | null; usage?: GateCheck | null };

function evaluateGraph(args: EvaluationArgs, config: DynamicRouteConfig): DynamicRouteEvaluation {
	const nodes = config.nodes ?? [];
	const edges = config.edges ?? [];
	const byId = new Map(nodes.map((node) => [node.id, node]));
	let current = config.entryNodeId ? byId.get(config.entryNodeId) : nodes.find((node) => node.type === "start");
	let action: DynamicRouteAction = {};
	const visitedNodeIds: string[] = [];
	const seen = new Set<string>();
	while (current && visitedNodeIds.length < 64 && !seen.has(current.id)) {
		seen.add(current.id);
		visitedNodeIds.push(current.id);
		let handle: string | null = null;
		if (current.type === "condition") handle = matches(current.data, args) ? "true" : "false";
		if (current.type === "percentage") handle = selectedPercentageHandle(current, args);
		if (current.type === "rate_limit" || current.type === "budget_limit") handle = limitExceeded(current, args.usage) ? "exceeded" : "within";
		if (current.type === "model") action = { ...action, ...normalizeAction(current.data) };
		if (current.type === "end") break;
		const outgoing = edges.filter((edge) => edge.source === current!.id);
		const edge = (handle ? outgoing.find((candidate) => candidate.sourceHandle === handle) : null) ?? outgoing.find((candidate) => !candidate.sourceHandle) ?? outgoing[0];
		current = edge ? byId.get(edge.target) : undefined;
	}
	return { routeId: args.policy.id, routeName: args.policy.name, routeVersion: args.policy.version, matchedRuleId: null, matchedRuleName: null, visitedNodeIds, action: { ...(config.defaultAction ?? {}), ...action }, cacheAwareRouting: config.cacheAwareRouting !== false, sessionAffinity: config.sessionAffinity !== false };
}

function legacyMatches(rule: DynamicRouteRule, args: EvaluationArgs): boolean {
	if (rule.condition.field === "always") return true;
	const source = rule.condition.field === "metadata" ? "metadata" : rule.condition.field;
	return matches({ source, path: rule.condition.metadataKey, operator: rule.condition.operator, value: rule.condition.value }, args);
}

export function evaluateDynamicRoute(args: EvaluationArgs): DynamicRouteEvaluation {
	const config = normalizeDynamicRouteConfig(args.policy.config);
	if (config.nodes?.length) return evaluateGraph(args, config);
	const matched = (config.rules ?? []).find((rule) => rule.enabled && legacyMatches(rule, args)) ?? null;
	return { routeId: args.policy.id, routeName: args.policy.name, routeVersion: args.policy.version, matchedRuleId: matched?.id ?? null, matchedRuleName: matched?.name ?? null, visitedNodeIds: [], action: matched?.action ?? config.defaultAction ?? {}, cacheAwareRouting: config.cacheAwareRouting !== false, sessionAffinity: config.sessionAffinity !== false };
}

export function applyDynamicRouteToBody(body: any, evaluation: DynamicRouteEvaluation): any {
	const provider = body?.provider && typeof body.provider === "object" ? { ...body.provider } : {};
	const routing = body?.routing && typeof body.routing === "object" ? { ...body.routing } : {};
	const action = evaluation.action;
	if (action.providerOrder?.length) provider.order = [...action.providerOrder];
	if (action.providerOnly?.length) provider.only = [...action.providerOnly];
	if (action.providerIgnore?.length) provider.ignore = [...action.providerIgnore];
	if (typeof action.allowFallbacks === "boolean") provider.allow_fallbacks = action.allowFallbacks;
	if (action.routingMode) provider.sort = action.routingMode;
	if (action.modelFallbacks?.length) routing.model_fallbacks = [...action.modelFallbacks];
	if (typeof routing.cache_aware !== "boolean" && typeof routing.cacheAware !== "boolean") routing.cache_aware = evaluation.cacheAwareRouting;
	if (typeof routing.session_affinity !== "boolean" && typeof routing.sessionAffinity !== "boolean") routing.session_affinity = evaluation.sessionAffinity;
	return { ...body, ...(action.model ? { model: action.model } : {}), provider, routing };
}
