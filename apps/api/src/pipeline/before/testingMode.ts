const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function normalizeBooleanFlag(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return TRUTHY_VALUES.has(value.trim().toLowerCase());
	return false;
}

export function isTestingModeRequested(req: Request, rawBody: any): boolean {
	return normalizeBooleanFlag(
		req.headers.get("x-phaseo-testing-mode") ??
		req.headers.get("x-aistats-testing-mode") ??
		req.headers.get("x-gateway-testing-mode") ??
		rawBody?.testing_mode ??
		rawBody?.testingMode ??
		rawBody?.debug?.testing_mode ??
		rawBody?.debug?.testingMode
	);
}

export async function resolveTestingMode(args: {
	requested: boolean;
	workspaceId: string;
	userId?: string | null;
	internal?: boolean;
}): Promise<{
	enabled: boolean;
	reason:
	| "not_requested"
	| "internal"
	| "requires_admin"
	| "requires_internal_token";
}> {
	if (!args.requested) {
		return { enabled: false, reason: "not_requested" };
	}
	if (args.internal) {
		if (!args.userId) return { enabled: false, reason: "requires_admin" };
		try {
			const { data, error } = await getSupabaseAdmin().from("users")
				.select("role").eq("user_id", args.userId).maybeSingle();
			if (!error && data?.role === "admin") return { enabled: true, reason: "internal" };
		} catch {
			// Internal inference must fail closed when role verification is unavailable.
		}
		return { enabled: false, reason: "requires_admin" };
	}
	return { enabled: false, reason: "requires_internal_token" };
}

export function resolvePerfGatewayAccess(args: {
	environment?: string | null;
	allowedWorkspaceId?: string | null;
	workspaceId: string;
}): {
	perfEnvironment: boolean;
	allowed: boolean;
	reason: "not_perf_environment" | "perf_workspace_not_configured" | "perf_workspace_not_allowed" | "allowed";
} {
	const perfEnvironment = String(args.environment ?? "").trim().toLowerCase() === "perf";
	if (!perfEnvironment) {
		return { perfEnvironment: false, allowed: true, reason: "not_perf_environment" };
	}

	const allowedWorkspaceId = String(args.allowedWorkspaceId ?? "").trim();
	if (!allowedWorkspaceId) {
		return { perfEnvironment: true, allowed: false, reason: "perf_workspace_not_configured" };
	}
	if (args.workspaceId !== allowedWorkspaceId) {
		return { perfEnvironment: true, allowed: false, reason: "perf_workspace_not_allowed" };
	}
	return { perfEnvironment: true, allowed: true, reason: "allowed" };
}

export function isPerfGatewayEndpointAllowed(args: {
	perfEnvironment: boolean;
	allowedEndpoints?: string | null;
	endpoint: string;
}): boolean {
	if (!args.perfEnvironment) return true;
	const allowed = String(args.allowedEndpoints ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!allowed.length) return false;
	return allowed.includes(args.endpoint);
}
import { getSupabaseAdmin } from "@/runtime/env";
