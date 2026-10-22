import type {
	SettingsRateLimitPolicy,
	SettingsRateLimitsInitialData,
	SettingsRateLimitTargetType,
} from "@/lib/fetchers/internal/settingsTypes";

// Mirrors the gateway's validation in apps/api/src/routes/v1/control/rate-limits.ts,
// so the form can point at the field before a round trip. The gateway still
// decides; its message is shown when it disagrees.

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INT4 = 2_147_483_647;

export const TARGET_TYPES: SettingsRateLimitTargetType[] = ["key", "member", "department", "guardrail", "end_user_default"];

export type PolicyDraft = {
	name: string;
	description: string;
	requestsPerMinute: string;
	tokensPerMinute: string;
};

export type PolicyProblem = "name" | "description" | "requestsPerMinute" | "tokensPerMinute" | "limits";

export type PolicyPayload = {
	name: string;
	description: string | null;
	requests_per_minute: number | null;
	tokens_per_minute: number | null;
};

export function emptyPolicyDraft(): PolicyDraft {
	return { name: "", description: "", requestsPerMinute: "", tokensPerMinute: "" };
}

export function draftFromPolicy(policy: SettingsRateLimitPolicy): PolicyDraft {
	return {
		name: policy.name,
		description: policy.description ?? "",
		requestsPerMinute: policy.requestsPerMinute == null ? "" : String(policy.requestsPerMinute),
		tokensPerMinute: policy.tokensPerMinute == null ? "" : String(policy.tokensPerMinute),
	};
}

/** Blank means no limit; otherwise a whole number from 1 to max. Thousands separators are allowed. */
function parseLimit(value: string, max: number): number | null | undefined {
	const trimmed = value.trim().replace(/[,_\s]/g, "");
	if (!trimmed) return null;
	if (!/^\d+$/.test(trimmed)) return undefined;
	const parsed = Number(trimmed);
	return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : undefined;
}

/**
 * Builds the create or update body. The page edits only requests and tokens per
 * minute, so a policy whose only limit is a concurrency limit set through the
 * API still counts as having a limit.
 */
export function draftToPayload(
	draft: PolicyDraft,
	existing?: Pick<SettingsRateLimitPolicy, "concurrentRequests"> | null,
): { ok: true; payload: PolicyPayload } | { ok: false; problem: PolicyProblem } {
	const name = draft.name.trim();
	if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, problem: "name" };
	const description = draft.description.trim();
	if (description.length > MAX_DESCRIPTION_LENGTH) return { ok: false, problem: "description" };
	const requestsPerMinute = parseLimit(draft.requestsPerMinute, MAX_INT4);
	if (requestsPerMinute === undefined) return { ok: false, problem: "requestsPerMinute" };
	const tokensPerMinute = parseLimit(draft.tokensPerMinute, Number.MAX_SAFE_INTEGER);
	if (tokensPerMinute === undefined) return { ok: false, problem: "tokensPerMinute" };
	if (requestsPerMinute === null && tokensPerMinute === null && existing?.concurrentRequests == null) {
		return { ok: false, problem: "limits" };
	}
	return {
		ok: true,
		payload: { name, description: description || null, requests_per_minute: requestsPerMinute, tokens_per_minute: tokensPerMinute },
	};
}

export type TargetOption = { value: string; label: string; description?: string };

/** Choices for one target type; targets that already have a policy are left out, as each can have only one. */
export function targetOptions(
	type: Exclude<SettingsRateLimitTargetType, "end_user_default">,
	data: Pick<SettingsRateLimitsInitialData, "targets" | "assignments">,
	unnamedMember: string,
): TargetOption[] {
	const taken = new Set(data.assignments.filter((assignment) => assignment.targetType === type).map((assignment) => assignment.targetId));
	const options: TargetOption[] = (() => {
		switch (type) {
			case "key": return data.targets.keys.map((key) => ({ value: key.id, label: key.name || key.prefix, description: key.prefix }));
			case "member": return data.targets.members.map((member) => ({ value: member.id, label: member.name || unnamedMember, description: member.role }));
			case "department": return data.targets.departments.map((department) => ({ value: department.id, label: department.name }));
			case "guardrail": return data.targets.guardrails.map((guardrail) => ({ value: guardrail.id, label: guardrail.name }));
		}
	})();
	return options.filter((option) => !taken.has(option.value));
}

/** The target's display name, or null when it no longer exists (the row is about to cascade away). */
export function targetName(
	type: SettingsRateLimitTargetType,
	id: string | null,
	targets: SettingsRateLimitsInitialData["targets"],
	unnamedMember: string,
): string | null {
	switch (type) {
		case "key": {
			const key = targets.keys.find((entry) => entry.id === id);
			return key ? key.name || key.prefix : null;
		}
		case "member": {
			const member = targets.members.find((entry) => entry.id === id);
			return member ? member.name || unnamedMember : null;
		}
		case "department": return targets.departments.find((entry) => entry.id === id)?.name ?? null;
		case "guardrail": return targets.guardrails.find((entry) => entry.id === id)?.name ?? null;
		case "end_user_default": return null;
	}
}
