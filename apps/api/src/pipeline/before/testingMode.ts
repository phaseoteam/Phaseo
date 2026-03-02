const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function normalizeBooleanFlag(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return TRUTHY_VALUES.has(value.trim().toLowerCase());
	return false;
}

export function isTestingModeRequested(req: Request, rawBody: any): boolean {
	return normalizeBooleanFlag(
		req.headers.get("x-aistats-testing-mode") ??
		req.headers.get("x-ai-stats-testing-mode") ??
		req.headers.get("x-gateway-testing-mode") ??
		rawBody?.testing_mode ??
		rawBody?.testingMode ??
		rawBody?.debug?.testing_mode ??
		rawBody?.debug?.testingMode
	);
}

export async function resolveTestingMode(args: {
	requested: boolean;
	teamId: string;
	userId?: string | null;
	internal?: boolean;
}): Promise<{
	enabled: boolean;
	reason:
	| "not_requested"
	| "internal"
	| "requires_internal_token";
}> {
	if (!args.requested) {
		return { enabled: false, reason: "not_requested" };
	}
	if (args.internal) {
		return { enabled: true, reason: "internal" };
	}
	return { enabled: false, reason: "requires_internal_token" };
}
