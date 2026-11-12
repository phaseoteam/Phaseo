const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);
// Cache only denials: ordinary users avoid repeat reads, while admin grants
// are verified on every request so revoked access is never cached.
const nonAdminUntil = new Map<string, number>();
const NON_ADMIN_CACHE_MS = 30_000;
// Whether a model has an internal route is catalogue data, not an access grant:
// the admin role is still checked live before testing mode is enabled.
const INTERNAL_ROUTE_FRESH_MS = 60_000;

/** True when the model has an internal route; false (fail closed) on lookup errors. */
async function modelHasInternalRoute(model: string): Promise<boolean> {
	try {
		const value = await tieredRead<boolean>({
			key: `testing-mode:internal-route:v1:${model}`,
			l1FreshMs: INTERNAL_ROUTE_FRESH_MS,
			maxStaleMs: 2 * INTERNAL_ROUTE_FRESH_MS,
			l2: { freshS: INTERNAL_ROUTE_FRESH_MS / 1000, storeS: (2 * INTERNAL_ROUTE_FRESH_MS) / 1000 },
			l3: false,
			loader: async () => {
				const route = await getSupabaseAdmin().from("v2_model_provider_routes")
					.select("provider_model_id").eq("model_slug", model)
					.eq("access_scope", "internal").in("phaseo_status", ["testing", "enabled"])
					.limit(1).maybeSingle();
				if (route.error) throw new Error("internal_route_lookup_failed");
				return Boolean(route.data);
			},
		});
		return value === true;
	} catch {
		return false;
	}
}

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
	model?: string;
}): Promise<{
	enabled: boolean;
	reason:
	| "not_requested"
	| "internal"
	| "admin"
	| "requires_admin"
	| "requires_internal_token";
}> {
	if (!args.requested && !args.model) {
		return { enabled: false, reason: "not_requested" };
	}
	// An ordinary request can only enter testing mode for a model with an internal
	// route, so requests to public models skip the role lookup entirely.
	let internalRoute: boolean | null = null;
	if (!args.requested) {
		internalRoute = await modelHasInternalRoute(args.model!);
		if (!internalRoute) return { enabled: false, reason: "not_requested" };
	}
	if (args.userId && (nonAdminUntil.get(args.userId) ?? 0) <= Date.now()) {
		try {
			const { data, error } = await getSupabaseAdmin().from("users")
				.select("role").eq("user_id", args.userId).maybeSingle();
			if (!error && data && data.role !== "admin") {
				if (nonAdminUntil.size >= 256) nonAdminUntil.delete(nonAdminUntil.keys().next().value!);
				nonAdminUntil.set(args.userId, Date.now() + NON_ADMIN_CACHE_MS);
			}
			if (!error && data?.role === "admin") {
				if (args.requested && args.internal) return { enabled: true, reason: "internal" };
				if (!args.model) return { enabled: false, reason: args.requested ? "requires_internal_token" : "not_requested" };
				// Only opt ordinary requests into testing for explicitly internal routes.
				// Public model requests keep their normal routing and provider gates.
				internalRoute ??= await modelHasInternalRoute(args.model);
				if (internalRoute) return { enabled: true, reason: "admin" };
			}
		} catch {
			// Internal inference must fail closed when role verification is unavailable.
		}
	}
	if (!args.requested) return { enabled: false, reason: "not_requested" };
	if (args.internal) return { enabled: false, reason: "requires_admin" };
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
import { tieredRead } from "@core/tiered-cache";
