import type {
	SettingsGuardrailKey,
	SettingsGuardrailMember,
	SettingsGuardrailRow,
} from "@/lib/fetchers/internal/settingsTypes";

export type GuardrailAction = "flag" | "redact" | "block";
export type AssignmentTargetType = "key" | "member";

/** What a set of guardrails adds up to, merged the way the gateway's buildWorkspacePolicy merges them. Workspace-wide settings are left out. */
export type EffectiveGuardrailPolicy = {
	activeCount: number;
	zdrOnly: boolean;
	/** null when no guardrail sets an allowlist; otherwise the size of the intersection (0 blocks every provider). */
	providerAllowCount: number | null;
	providerBlockCount: number;
	modelAllowCount: number | null;
	modelBlockCount: number;
	promptInjection: GuardrailAction | null;
	sensitiveInfoRuleCount: number;
};

export type AssignedGuardrail = {
	id: string;
	name: string;
	enabled: boolean;
	/** "member" means the key inherits it from the member the gateway treats as the key's principal. */
	source: "direct" | "member";
};

export type GuardrailAssignmentRow = {
	type: AssignmentTargetType;
	id: string;
	name: string;
	/** Key prefix or member role. */
	detail: string;
	status: string | null;
	guardrails: AssignedGuardrail[];
	directGuardrailIds: string[];
	inheritedFrom: { id: string; name: string } | null;
	effective: EffectiveGuardrailPolicy;
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
	const active = guardrails.filter(isGuardrailActive);
	for (const guardrail of active) {
		zdrOnly ||= guardrail.privacy_zdr_only === true;
		const providerIds = idSet(guardrail.provider_restriction_provider_ids);
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
	return {
		activeCount: active.length,
		zdrOnly,
		providerAllowCount: providerAllow ? providerAllow.size : null,
		providerBlockCount: providerBlock.size,
		modelAllowCount: modelAllow ? modelAllow.size : null,
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

export function buildGuardrailAssignmentRows(args: {
	targetType: AssignmentTargetType;
	keys: SettingsGuardrailKey[];
	members: SettingsGuardrailMember[];
	guardrails: SettingsGuardrailRow[];
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrailMemberIdsByGuardrailId: Record<string, string[]>;
	untitled: string;
}): GuardrailAssignmentRow[] {
	// Keep the guardrails list order (newest first) inside each row.
	const order = new Map(args.guardrails.map((guardrail, index) => [guardrail.id, index]));
	const guardrailById = new Map(args.guardrails.map((guardrail) => [guardrail.id, guardrail]));
	const byKey = guardrailIdsByTarget(args.guardrailKeyIdsByGuardrailId);
	const byMember = guardrailIdsByTarget(args.guardrailMemberIdsByGuardrailId);
	const memberById = new Map(args.members.map((member) => [member.id, member]));
	const known = (ids: string[]) => ids.filter((id) => guardrailById.has(id)).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
	const assigned = (id: string, source: AssignedGuardrail["source"]): AssignedGuardrail => {
		const guardrail = guardrailById.get(id)!;
		return { id, name: guardrail.name?.trim() || args.untitled, enabled: isGuardrailActive(guardrail), source };
	};

	if (args.targetType === "member") {
		return args.members.map((member) => {
			const direct = known(byMember.get(member.id) ?? []);
			return {
				type: "member",
				id: member.id,
				name: member.name,
				detail: member.role,
				status: null,
				guardrails: direct.map((id) => assigned(id, "direct")),
				directGuardrailIds: direct,
				inheritedFrom: null,
				effective: effectiveGuardrailPolicy(direct.map((id) => guardrailById.get(id)!)),
			};
		});
	}

	return args.keys.map((key) => {
		const direct = known(byKey.get(key.id) ?? []);
		const principal = key.principalUserId ? memberById.get(key.principalUserId) ?? null : null;
		const inherited = principal ? known(byMember.get(principal.id) ?? []).filter((id) => !direct.includes(id)) : [];
		const all = [...direct, ...inherited];
		return {
			type: "key",
			id: key.id,
			name: key.name,
			detail: key.prefix,
			status: key.status,
			guardrails: [...direct.map((id) => assigned(id, "direct")), ...inherited.map((id) => assigned(id, "member"))],
			directGuardrailIds: direct,
			inheritedFrom: principal && inherited.length ? { id: principal.id, name: principal.name } : null,
			effective: effectiveGuardrailPolicy(all.map((id) => guardrailById.get(id)!)),
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
