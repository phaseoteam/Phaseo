import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import type {
	AutoRoutingConfiguration,
	AutoRoutingObjective,
	AutoRoutingSpendProfile,
	DynamicRouteConfig,
} from "@/lib/fetchers/internal/settingsTypes";
import { autoRoutingFlag } from "@/lib/flags";

export type RoutingMode = "balanced" | "price" | "latency" | "throughput";

type UpdateRoutingSettingsInput = {
	mode: RoutingMode;
	betaChannelEnabled?: boolean;
	alphaChannelEnabled?: boolean;
	responseHealingEnabled?: boolean;
	responseHealingLocked?: boolean;
	responseHealingMode?: "safe" | "strict";
};

export const updateRoutingSettings = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: UpdateRoutingSettingsInput) => input)
	.handler(async ({ data: {
	mode,
	betaChannelEnabled,
	alphaChannelEnabled,
	responseHealingEnabled,
	responseHealingLocked,
	responseHealingMode,
} }) => {
		try {
			const context = await getServerAccountContext();
			if (!context.accessToken || !context.workspaceId) {
				return { ok: false as const, error: "Select a workspace before changing routing settings." };
			}
			const response = await fetchAccountWebApi<{ ok: true; gatewayCacheInvalidated?: boolean }>("/api/account/settings/routing", context.accessToken, {
				method: "PUT",
				body: JSON.stringify({ workspaceId: context.workspaceId, mode, betaChannelEnabled, alphaChannelEnabled, responseHealingEnabled, responseHealingLocked, responseHealingMode }),
			});

			return { ok: true as const, gatewayCacheInvalidated: response.gatewayCacheInvalidated !== false };
		} catch (error) {
			return {
				ok: false as const,
				error: error instanceof WebApiError
					? `${error.detail ?? "The routing service rejected the update."} (${error.status})`
					: error instanceof Error
						? error.message
						: "The routing settings could not be updated.",
			};
		}
	});

export const updateRoutingMode = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((mode: RoutingMode) => mode)
	.handler(async ({ data: mode }) => {
		return updateRoutingSettings({ data: { mode } });
	});

export const updateAutoRoutingSettings = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		allowedPatterns: string[];
		spendProfile: AutoRoutingSpendProfile;
		maxInputPricePerMillion: number | null;
		maxOutputPricePerMillion: number | null;
		objective: AutoRoutingObjective;
		allowFallbacks: boolean;
	}) => input)
	.handler(async ({ data: input }) => {
		try {
			if (!(await autoRoutingFlag())) {
				return { ok: false as const, error: { code: "featureDisabled" as const } };
			}
			const context = await getServerAccountContext();
			if (!context.accessToken || !context.workspaceId) {
				return { ok: false as const, error: { code: "workspaceRequired" as const } };
			}
			const response = await fetchAccountWebApi<{
				autoRouting: AutoRoutingConfiguration;
				gatewayCacheInvalidated?: boolean;
				ok: true;
			}>("/api/account/settings/routing/auto", context.accessToken, {
				method: "PUT",
				body: JSON.stringify({ workspaceId: context.workspaceId, ...input }),
			});
			return {
				ok: true as const,
				autoRouting: response.autoRouting,
				gatewayCacheInvalidated: response.gatewayCacheInvalidated !== false,
			};
		} catch (error) {
			return {
				ok: false as const,
				error:
					error instanceof WebApiError
						? { code: "serviceRejected" as const, status: error.status }
						: { code: "updateFailed" as const },
			};
		}
	});

async function routingContext() {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) throw new Error("Missing workspace id");
	return context;
}

export const createDynamicRouteAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		name: string;
		description?: string | null;
		config: DynamicRouteConfig;
	}) => input)
	.handler(async ({ data: input }) => {
		const context = await routingContext();
		const result = await fetchAccountWebApi<{ route: { id: string; version: number } }>("/api/account/settings/dynamic-routes", context.accessToken, {
			method: "POST",
			body: JSON.stringify({ ...input, workspaceId: context.workspaceId }),
		});
		return result.route;
	});

export const updateDynamicRouteAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { routeId: string; input: {
		name?: string;
		description?: string | null;
		status?: "active" | "paused";
		config?: DynamicRouteConfig;
	} }) => input)
	.handler(async ({ data: { routeId, input } }) => {
		const context = await routingContext();
		const result = await fetchAccountWebApi<{ success: true; version: number }>(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}`, context.accessToken, {
			method: "PUT",
			body: JSON.stringify(input),
		});
		return result;
	});

export const attachDynamicRouteKeysAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { routeId: string; keyIds: string[] }) => input)
	.handler(async ({ data: { routeId, keyIds } }) => {
		const context = await routingContext();
		await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}/keys`, context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ keyIds }),
		});
	});

export const deployDynamicRouteVersionAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { routeId: string; version: number }) => input)
	.handler(async ({ data: { routeId, version } }) => {
		const context = await routingContext();
		await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}/versions/${version}/deploy`, context.accessToken, { method: "POST" });
	});

export const deleteDynamicRouteAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { routeId: string; confirmName: string }) => input)
	.handler(async ({ data: { routeId, confirmName } }) => {
		const context = await routingContext();
		await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}?confirmName=${encodeURIComponent(confirmName)}`, context.accessToken, {
			method: "DELETE",
		});
	});

export type SuccessorPricePolicy = "never" | "limit" | "any";

async function successorRoutingRequest(path: "/routing/successor" | "/routing/successor/replacements", method: "PUT" | "DELETE", body: Record<string, unknown>) {
	try {
		const context = await getServerAccountContext();
		if (!context.accessToken || !context.workspaceId) return { ok: false as const, status: 400 };
		await fetchAccountWebApi(`/api/account/settings${path}`, context.accessToken, {
			method,
			body: JSON.stringify({ workspaceId: context.workspaceId, ...body }),
		});
		return { ok: true as const };
	} catch (error) {
		return { ok: false as const, status: error instanceof WebApiError ? error.status : 500, code: error instanceof WebApiError ? error.detail ?? null : null };
	}
}

export const updateSuccessorRouting = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { enabled: boolean; pricePolicy: SuccessorPricePolicy; maxPriceIncreasePercent: number }) => input)
	.handler(async ({ data: input }) => {
		return successorRoutingRequest("/routing/successor", "PUT", input);
	});

/** `successor: null` never redirects `model` for this workspace. */
export const saveSuccessorReplacement = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { model: string; successor: string | null }) => input)
	.handler(async ({ data: input }) => {
		return successorRoutingRequest("/routing/successor/replacements", "PUT", input);
	});

export const removeSuccessorReplacement = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((model: string) => model)
	.handler(async ({ data: model }) => {
		return successorRoutingRequest("/routing/successor/replacements", "DELETE", { model });
	});
