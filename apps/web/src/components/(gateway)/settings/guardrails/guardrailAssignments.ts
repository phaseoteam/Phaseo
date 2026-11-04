import type {
	SettingsGuardrailDepartment,
	SettingsGuardrailKey,
	SettingsGuardrailMember,
	SettingsGuardrailRow,
} from "@/lib/fetchers/internal/settingsTypes";
import { normalizeProviderList } from "./providerAliases";

export type GuardrailAction = "flag" | "redact" | "block";
/** The four levels a guardrail can be assigned at, broadest first. */
export const ASSIGNMENT_TARGET_TYPES = ["workspace", "department", "member", "key"] as const;
export type AssignmentTargetType = (typeof ASSIGNMENT_TARGET_TYPES)[number];

/**
 * The id the whole-workspace row and its assignment map use. The workspace itself is the target,
 * so the API takes a workspace change with no target ids.
 */
export const WORKSPACE_TARGET_ID = "workspace";

/** What a set of guardrails adds up to, merged the way the gateway's buildWorkspacePolicy merges them. Workspace-wide settings are left out. */
export type EffectiveGuardrailPolicy = {
	activeCount: number;
	zdrOnly: boolean;
	/** A guardrail turns off training on paid or free endpoints, or endpoints that log prompts and outputs. */
	noPaidTraining: boolean;
	noFreeTraining: boolean;
	noLogging: boolean;
	/** null when no guardrail sets an allowlist; otherwise the size of the intersection (0 blocks every provider). */
	providerAllowCount: number | null;
	providerBlockCount: number;
	modelAllowCount: number | null;
	modelBlockCount: number;
	promptInjection: GuardrailAction | null;
	sensitiveInfoRuleCount: number;
};

/** Where a guardrail that reaches a row comes from: assigned to the row itself, or inherited from a broader level. */
export type GuardrailSource =
	| { level: "direct" }
	| { level: "workspace" }
	| { level: "department"; id: string; name: string }
	/** The key's principal member; `name` is null when they have left the workspace (their guardrails still apply). */
	| { level: "member"; id: string; name: string | null };

export type AssignedGuardrail = {
	id: string;
	name: string;
	enabled: boolean;
	/** The most specific place it comes from; `sources` lists every one, as the gateway counts each. */
	source: GuardrailSource;
	sources: GuardrailSource[];
	/** The workspace baseline (Settings, Privacy): always on the whole workspace, never assigned here. */
	baseline: boolean;
};

export type GuardrailAssignmentRow = {
	type: AssignmentTargetType;
	id: string;
	name: string;
	/** Key prefix, member role, or a department's or the workspace's reach. */
	detail: string;
	status: string | null;
	guardrails: AssignedGuardrail[];
	directGuardrailIds: string[];
	/** `name` is null when the key's creator has left the workspace; their member guardrails still apply. */
	inheritedFrom: { id: string; name: string | null } | null;
	effective: EffectiveGuardrailPolicy;
	/** The guardrails behind the Access and Safety columns, so each cell can name where its rules come from. */
	accessFrom: AssignedGuardrail[];
	safetyFrom: AssignedGuardrail[];
};

const ACTION_RANK: Record<GuardrailAction, number> = { flag: 0, redact: 1, block: 2 };

function normalizeAction(value: unknown): GuardrailAction | null {
	const raw = String(value ?? "").trim().toLowerCase();
	return raw === "flag" || raw === "redact" || raw === "block" ? raw : null;
}

function strictest(current: GuardrailAction | null, next: GuardrailAction): GuardrailAction {
	return current && ACTION_RANK[current] >= ACTION_RANK[next] ? current : next;
}

function idSet(values: unknown): string[] {
	return Array.isArray(values) ? [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))] : [];
}

function intersect(current: Set<string> | null, values: string[]): Set<string> {
	if (!current) return new Set(values);
	const next = new Set(values);
	return new Set([...current].filter((value) => next.has(value)));
}

function restrictionMode(value: unknown): "allowlist" | "blocklist" | null {
	const raw = String(value ?? "").toLowerCase();
	return raw === "allowlist" || raw === "blocklist" ? raw : null;
}

/** The gateway only loads guardrails whose enabled column is true. */
export function isGuardrailActive(guardrail: SettingsGuardrailRow): boolean {
	return guardrail.enabled === true;
}

export function effectiveGuardrailPolicy(guardrails: SettingsGuardrailRow[]): EffectiveGuardrailPolicy {
	let providerAllow: Set<string> | null = null;
	const providerBlock = new Set<string>();
	let modelAllow: Set<string> | null = null;
	const modelBlock = new Set<string>();
	const sensitiveRules = new Set<string>();
	let promptInjection: GuardrailAction | null = null;
	let zdrOnly = false;
	let noPaidTraining = false;
	let noFreeTraining = false;
	let noLogging = false;
	const active = guardrails.filter(isGuardrailActive);
	for (const guardrail of active) {
		zdrOnly ||= guardrail.privacy_zdr_only === true;
		noPaidTraining ||= guardrail.privacy_enable_paid_may_train === false;
		noFreeTraining ||= guardrail.privacy_enable_free_may_train === false;
		noLogging ||= guardrail.privacy_enable_input_output_logging === false;
		// The gateway maps provider aliases onto canonical ids before it merges lists (workspacePolicy.ts).
		const providerIds = idSet(normalizeProviderList(idSet(guardrail.provider_restriction_provider_ids)));
		const providerMode = restrictionMode(guardrail.provider_restriction_mode);
		if (providerMode === "allowlist") providerAllow = intersect(providerAllow, providerIds);
		else if (providerMode === "blocklist") for (const id of providerIds) providerBlock.add(id);
		const modelIds = idSet(guardrail.allowed_api_model_ids);
		const modelMode = restrictionMode(guardrail.model_restriction_mode);
		if (modelMode === "allowlist") modelAllow = intersect(modelAllow, modelIds);
		else if (modelMode === "blocklist") for (const id of modelIds) modelBlock.add(id);
		if (guardrail.prompt_injection_enabled) {
			promptInjection = strictest(promptInjection, normalizeAction(guardrail.prompt_injection_action) ?? "flag");
		}
		if (guardrail.sensitive_info_enabled) {
			for (const rule of guardrail.sensitive_info_rules ?? []) {
				if (!rule || rule.enabled === false || !String(rule.id ?? "").trim()) continue;
				if (rule.kind === "custom" && (!rule.name?.trim() || !rule.pattern?.trim())) continue;
				sensitiveRules.add(`${rule.kind === "custom" ? "custom" : "builtin"}:${String(rule.id).trim()}`);
			}
		}
	}
	// The gateway allows an id only when it is on the allowlist and not on the blocklist.
	const allowedCount = (allow: Set<string> | null, block: Set<string>) => allow ? [...allow].filter((id) => !block.has(id)).length : null;
	return {
		activeCount: active.length,
		zdrOnly,
		noPaidTraining,
		noFreeTraining,
		noLogging,
		providerAllowCount: allowedCount(providerAllow, providerBlock),
		providerBlockCount: providerBlock.size,
		modelAllowCount: allowedCount(modelAllow, modelBlock),
		modelBlockCount: modelBlock.size,
		promptInjection,
		sensitiveInfoRuleCount: sensitiveRules.size,
	};
}

/** Turns guardrail → targets maps into target → guardrails. */
export function guardrailIdsByTarget(targetIdsByGuardrailId: Record<string, string[]>): Map<string, string[]> {
	const byTarget = new Map<string, string[]>();
	for (const [guardrailId, targetIds] of Object.entries(targetIdsByGuardrailId)) {
		for (const targetId of targetIds) byTarget.set(targetId, [...(byTarget.get(targetId) ?? []), guardrailId]);
	}
	return byTarget;
}

/** The workspace-level guardrail ids as an assignment map, so the workspace row works like any other target. */
export function workspaceAssignmentMap(workspaceGuardrailIds: string[]): Record<string, string[]> {
	return Object.fromEntries(workspaceGuardrailIds.map((id) => [id, [WORKSPACE_TARGET_ID]]));
}

/** Whether a guardrail sets any access rule the Access column shows. */
export function setsAccessRules(guardrail: SettingsGuardrailRow): boolean {
	return guardrail.privacy_zdr_only === true
		|| guardrail.privacy_enable_paid_may_train === false
		|| guardrail.privacy_enable_free_may_train === false
		|| guardrail.privacy_enable_input_output_logging === false
		|| Boolean(restrictionMode(guardrail.provider_restriction_mode))
		|| Boolean(restrictionMode(guardrail.model_restriction_mode));
}

/** Whether a guardrail sets any safety rule (prompt injection or sensitive info). */
export function setsSafetyRules(guardrail: SettingsGuardrailRow): boolean {
	return guardrail.prompt_injection_enabled === true
		|| (guardrail.sensitive_info_enabled === true && (guardrail.sensitive_info_rules ?? []).some((rule) => rule && rule.enabled !== false));
}

export type GuardrailAssignmentData = {
	keys: SettingsGuardrailKey[];
	members: SettingsGuardrailMember[];
	departments?: SettingsGuardrailDepartment[];
	/** Every guardrail, the workspace baseline included. */
	guardrails: SettingsGuardrailRow[];
	/** Workspace-level assignments, as built by workspaceAssignmentMap. */
	guardrailWorkspaceIdsByGuardrailId?: Record<string, string[]>;
	guardrailDepartmentIdsByGuardrailId?: Record<string, string[]>;
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrailMemberIdsByGuardrailId: Record<string, string[]>;
	/** The departments whose guardrails reach each key and member, as the gateway counts them. */
	keyDepartmentIds?: Record<string, string[]>;
	memberDepartmentIds?: Record<string, string[]>;
};

/** Row details the caller words: the workspace row's name and reach, and a department's reach. */
export type AssignmentRowLabels = {
	untitled: string;
	workspace?: { name: string; detail: string };
	departmentDetail?: (counts: { members: number; keys: number }) => string;
};

const SOURCE_RANK: Record<GuardrailSource["level"], number> = { direct: 0, member: 1, department: 2, workspace: 3 };

export function buildGuardrailAssignmentRows(args: GuardrailAssignmentData & AssignmentRowLabels & { targetType: AssignmentTargetType }): GuardrailAssignmentRow[] {
	// Keep the guardrails list order (newest first) inside each level, the baseline last.
	const order = new Map(args.guardrails.map((guardrail, index) => [guardrail.id, guardrail.is_workspace_baseline ? Number.MAX_SAFE_INTEGER : index]));
	const guardrailById = new Map(args.guardrails.map((guardrail) => [guardrail.id, guardrail]));
	const byWorkspace = guardrailIdsByTarget(args.guardrailWorkspaceIdsByGuardrailId ?? {});
	const byDepartment = guardrailIdsByTarget(args.guardrailDepartmentIdsByGuardrailId ?? {});
	const byKey = guardrailIdsByTarget(args.guardrailKeyIdsByGuardrailId);
	const byMember = guardrailIdsByTarget(args.guardrailMemberIdsByGuardrailId);
	const memberById = new Map(args.members.map((member) => [member.id, member]));
	const departments = args.departments ?? [];
	const departmentById = new Map(departments.map((department) => [department.id, department]));
	const known = (ids: string[]) => ids.filter((id) => guardrailById.has(id));
	const sortByOrder = (ids: string[]) => [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
	const workspaceIds = sortByOrder(known(byWorkspace.get(WORKSPACE_TARGET_ID) ?? []));

	/** One row's guardrails from its own assignments and each broader level, every guardrail once. */
	const resolve = (direct: string[], inherited: Array<{ source: GuardrailSource; ids: string[] }>) => {
		const sourcesById = new Map<string, GuardrailSource[]>();
		const add = (id: string, source: GuardrailSource) => sourcesById.set(id, [...(sourcesById.get(id) ?? []), source]);
		for (const id of direct) add(id, { level: "direct" });
		for (const level of inherited) for (const id of known(level.ids)) add(id, level.source);
		const guardrails: AssignedGuardrail[] = [...sourcesById.entries()].map(([id, sources]) => {
			const guardrail = guardrailById.get(id)!;
			const sorted = [...sources].sort((a, b) => SOURCE_RANK[a.level] - SOURCE_RANK[b.level]);
			return {
				id,
				name: guardrail.name?.trim() || args.untitled,
				enabled: isGuardrailActive(guardrail),
				source: sorted[0]!,
				sources: sorted,
				baseline: guardrail.is_workspace_baseline === true,
			};
		}).sort((a, b) => SOURCE_RANK[a.source.level] - SOURCE_RANK[b.source.level] || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
		return {
			guardrails,
			directGuardrailIds: direct,
			effective: effectiveGuardrailPolicy(guardrails.map((guardrail) => guardrailById.get(guardrail.id)!)),
			accessFrom: guardrails.filter((guardrail) => guardrail.enabled && setsAccessRules(guardrailById.get(guardrail.id)!)),
			safetyFrom: guardrails.filter((guardrail) => guardrail.enabled && setsSafetyRules(guardrailById.get(guardrail.id)!)),
		};
	};
	const workspaceLevel = { source: { level: "workspace" } as GuardrailSource, ids: workspaceIds };
	const departmentLevels = (departmentIds: string[]) => departmentIds.flatMap((departmentId) => {
		const department = departmentById.get(departmentId);
		return department
			? [{ source: { level: "department", id: department.id, name: department.name } as GuardrailSource, ids: byDepartment.get(department.id) ?? [] }]
			: [];
	});

	if (args.targetType === "workspace") {
		return [{
			type: "workspace",
			id: WORKSPACE_TARGET_ID,
			name: args.workspace?.name ?? WORKSPACE_TARGET_ID,
			detail: args.workspace?.detail ?? "",
			status: null,
			inheritedFrom: null,
			...resolve(workspaceIds, []),
		}];
	}

	if (args.targetType === "department") {
		const reach = new Map<string, { members: number; keys: number }>();
		const count = (scopes: Record<string, string[]> | undefined, field: "members" | "keys") => {
			for (const ids of Object.values(scopes ?? {})) {
				for (const id of ids) {
					const current = reach.get(id) ?? { members: 0, keys: 0 };
					reach.set(id, { ...current, [field]: current[field] + 1 });
				}
			}
		};
		count(args.memberDepartmentIds, "members");
		count(args.keyDepartmentIds, "keys");
		return departments.map((department) => ({
			type: "department",
			id: department.id,
			name: department.name,
			detail: args.departmentDetail?.(reach.get(department.id) ?? { members: 0, keys: 0 }) ?? "",
			status: null,
			inheritedFrom: null,
			...resolve(sortByOrder(known(byDepartment.get(department.id) ?? [])), [workspaceLevel]),
		}));
	}

	if (args.targetType === "member") {
		return args.members.map((member) => ({
			type: "member",
			id: member.id,
			name: member.name,
			detail: member.role,
			status: null,
			inheritedFrom: null,
			...resolve(sortByOrder(known(byMember.get(member.id) ?? [])), [
				...departmentLevels(args.memberDepartmentIds?.[member.id] ?? []),
				workspaceLevel,
			]),
		}));
	}

	return args.keys.map((key) => {
		const direct = sortByOrder(known(byKey.get(key.id) ?? []));
		// The gateway applies the principal's member guardrails whether or not they are still a member,
		// so look them up by id and use the member list only for the name.
		const principalId = key.principalUserId ?? null;
		const principalName = principalId ? memberById.get(principalId)?.name ?? null : null;
		const memberIds = principalId ? sortByOrder(known(byMember.get(principalId) ?? [])) : [];
		return {
			type: "key",
			id: key.id,
			name: key.name,
			detail: key.prefix,
			status: key.status,
			inheritedFrom: principalId && memberIds.some((id) => !direct.includes(id)) ? { id: principalId, name: principalName } : null,
			...resolve(direct, [
				...(principalId ? [{ source: { level: "member", id: principalId, name: principalName } as GuardrailSource, ids: memberIds }] : []),
				...departmentLevels(args.keyDepartmentIds?.[key.id] ?? []),
				workspaceLevel,
			]),
		};
	});
}

/** The assignment maps after an add/remove change, for showing a change before the refetch confirms it. */
export function applyGuardrailAssignmentChange(
	targetIdsByGuardrailId: Record<string, string[]>,
	change: { targetIds: string[]; addGuardrailIds?: string[]; removeGuardrailIds?: string[] },
): Record<string, string[]> {
	const next: Record<string, string[]> = { ...targetIdsByGuardrailId };
	const targets = new Set(change.targetIds);
	for (const guardrailId of change.removeGuardrailIds ?? []) {
		next[guardrailId] = (next[guardrailId] ?? []).filter((id) => !targets.has(id));
	}
	for (const guardrailId of change.addGuardrailIds ?? []) {
		next[guardrailId] = [...new Set([...(next[guardrailId] ?? []), ...change.targetIds])];
	}
	return next;
}

/** Whether every, some or none of the rows have the guardrail directly assigned; drives the bulk menu's checkmarks. */
export function directAssignmentState(rows: GuardrailAssignmentRow[], guardrailId: string): "all" | "some" | "none" {
	const count = rows.filter((row) => row.directGuardrailIds.includes(guardrailId)).length;
	if (!count) return "none";
	return count === rows.length ? "all" : "some";
}

export function matchesAssignmentQuery(row: GuardrailAssignmentRow, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return [row.name, row.detail, ...row.guardrails.map((guardrail) => guardrail.name)].some((value) => value.toLowerCase().includes(q));
}

export type AssignmentChange = { targetIds: string[]; addGuardrailIds?: string[]; removeGuardrailIds?: string[] };

/**
 * A change shown before the refetch confirms it. `savedOn` is the assignment map that was current
 * when the save succeeded: once fresher data replaces that map, the data includes the change.
 */
export type PendingAssignmentChange = {
	id: number;
	targetType: AssignmentTargetType;
	change: AssignmentChange;
	savedOn: Record<string, string[]> | null;
};

/** The assignment map with the changes still saving, and the saved ones not yet refetched, applied in order. */
export function withPendingChanges(
	targetIdsByGuardrailId: Record<string, string[]>,
	targetType: AssignmentTargetType,
	pending: PendingAssignmentChange[],
): Record<string, string[]> {
	return pending
		.filter((entry) => entry.targetType === targetType && (entry.savedOn === null || entry.savedOn === targetIdsByGuardrailId))
		.reduce((map, entry) => applyGuardrailAssignmentChange(map, entry.change), targetIdsByGuardrailId);
}

/** Splits a change's targets into changes the API accepts. */
export function chunkAssignmentChange(change: AssignmentChange, maxTargets: number): AssignmentChange[] {
	const chunks: AssignmentChange[] = [];
	for (let start = 0; start < change.targetIds.length; start += maxTargets) {
		chunks.push({ ...change, targetIds: change.targetIds.slice(start, start + maxTargets) });
	}
	return chunks;
}
