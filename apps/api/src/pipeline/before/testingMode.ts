import { getBindings, getSupabaseAdmin } from "@/runtime/env";

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function normalizeBooleanFlag(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return TRUTHY_VALUES.has(value.trim().toLowerCase());
	return false;
}

function getRuntimeEnvName(): string {
	const bindings = getBindings();
	const runtimeEnv = typeof bindings.NODE_ENV === "string"
		? bindings.NODE_ENV
		: (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined);
	return String(runtimeEnv ?? "").trim().toLowerCase();
}

function isProductionEnvironment(): boolean {
	return getRuntimeEnvName() === "production";
}

function isTestingModeEnvironmentAllowed(): boolean {
	const env = getRuntimeEnvName();
	return env === "development" || env === "test";
}

export function isTestingModeRequested(req: Request, rawBody: any): boolean {
	if (isLocalTestingOverrideEnabled()) return true;
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

function isLocalTestingOverrideEnabled(): boolean {
	if (!isTestingModeEnvironmentAllowed()) return false;
	const bindings = getBindings();
	return normalizeBooleanFlag(bindings.GATEWAY_LOCAL_TESTING_MODE);
}

async function isPlatformAdminUser(args: {
	userId: string;
}): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", args.userId)
		.maybeSingle();
	if (error) return false;
	const role = String(data?.role ?? "").trim().toLowerCase();
	return role === "admin";
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
	| "disabled_outside_development"
	| "internal"
	| "local_override"
	| "platform_admin"
	| "requires_platform_admin_or_local_override";
}> {
	if (!args.requested) {
		return { enabled: false, reason: "not_requested" };
	}
	if (!isTestingModeEnvironmentAllowed()) {
		return { enabled: false, reason: "disabled_outside_development" };
	}
	if (args.internal) {
		return { enabled: true, reason: "internal" };
	}
	if (isLocalTestingOverrideEnabled()) {
		return { enabled: true, reason: "local_override" };
	}
	if (!args.userId) {
		return { enabled: false, reason: "requires_platform_admin_or_local_override" };
	}
	const allowed = await isPlatformAdminUser({
		userId: args.userId,
	});
	if (allowed) {
		return { enabled: true, reason: "platform_admin" };
	}
	return { enabled: false, reason: "requires_platform_admin_or_local_override" };
}
