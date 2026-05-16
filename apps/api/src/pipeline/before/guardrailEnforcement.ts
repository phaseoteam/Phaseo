import type {
	GuardrailAction,
	GuardrailEnforcementDetection,
	GuardrailEnforcementPayload,
} from "./types";

const ACTION_PRIORITY: Record<GuardrailAction, number> = {
	flag: 1,
	redact: 2,
	block: 3,
};

function sortActionsByPriority(actions: GuardrailAction[]): GuardrailAction[] {
	return [...actions].sort(
		(a, b) => ACTION_PRIORITY[b] - ACTION_PRIORITY[a] || a.localeCompare(b),
	);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function uniqueDetections(
	detections: GuardrailEnforcementDetection[],
): GuardrailEnforcementDetection[] {
	const seen = new Set<string>();
	return detections.filter((detection) => {
		const key = `${detection.detectorId}:${detection.category}:${detection.variant}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function buildGuardrailEnforcementPayload(args: {
	source: GuardrailEnforcementPayload["source"];
	action: GuardrailAction;
	detections: GuardrailEnforcementDetection[];
	guardrailIds: string[];
	redactionCount: number;
	actions?: GuardrailAction[];
}): GuardrailEnforcementPayload {
	const detections = uniqueDetections(args.detections);
	const actions = sortActionsByPriority(
		Array.from(new Set([args.action, ...(args.actions ?? [])])),
	);
	const action = actions[0] ?? args.action;
	return {
		source: args.source,
		action,
		detectionCount: detections.length,
		redactionCount: args.redactionCount,
		guardrailIds: uniqueStrings(args.guardrailIds),
		detections,
		actions,
		blocked: actions.includes("block"),
		flagged: actions.includes("flag"),
		redacted: args.redactionCount > 0 || actions.includes("redact"),
		detection_count: detections.length,
		redaction_count: args.redactionCount,
		guardrail_ids: uniqueStrings(args.guardrailIds),
		detectors: detections.map((detection) => ({
			detector_id: detection.detectorId,
			category: detection.category,
			variant: detection.variant,
		})),
	};
}

export function mergeGuardrailEnforcements(
	first: GuardrailEnforcementPayload | null,
	second: GuardrailEnforcementPayload | null,
): GuardrailEnforcementPayload | null {
	if (!first) return second;
	if (!second) return first;

	const actions = sortActionsByPriority([
		...(first.actions ?? [first.action]),
		...(second.actions ?? [second.action]),
	]);

	return buildGuardrailEnforcementPayload({
		source: first.source === second.source ? first.source : "multiple",
		action: actions[0] ?? first.action,
		actions,
		detections: [...first.detections, ...second.detections],
		guardrailIds: [...first.guardrailIds, ...second.guardrailIds],
		redactionCount: (first.redactionCount ?? 0) + (second.redactionCount ?? 0),
	});
}
