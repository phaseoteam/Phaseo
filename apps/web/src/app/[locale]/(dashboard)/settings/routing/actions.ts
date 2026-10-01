"use server";

import { revalidatePath } from "next/cache";
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

export async function updateRoutingSettings({
	mode,
	betaChannelEnabled,
	alphaChannelEnabled,
	responseHealingEnabled,
	responseHealingLocked,
	responseHealingMode,
}: UpdateRoutingSettingsInput) {
	try {
		const context = await getServerAccountContext();
		if (!context.accessToken || !context.workspaceId) {
			return { ok: false as const, error: "Select a workspace before changing routing settings." };
		}
		const response = await fetchAccountWebApi<{ ok: true; gatewayCacheInvalidated?: boolean }>("/api/account/settings/routing", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId: context.workspaceId, mode, betaChannelEnabled, alphaChannelEnabled, responseHealingEnabled, responseHealingLocked, responseHealingMode }),
		});

		revalidatePath("/settings/routing");
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
}

export async function updateRoutingMode(mode: RoutingMode) {
	return updateRoutingSettings({ mode });
}

export async function updateAutoRoutingSettings(input: {
	allowedPatterns: string[];
	spendProfile: AutoRoutingSpendProfile;
	maxInputPricePerMillion: number | null;
	maxOutputPricePerMillion: number | null;
	objective: AutoRoutingObjective;
	allowFallbacks: boolean;
}) {
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
		revalidatePath("/settings/routing/auto");
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
}

async function routingContext() {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) throw new Error("Missing workspace id");
	return context;
}

export async function createDynamicRouteAction(input: {
	name: string;
	description?: string | null;
	config: DynamicRouteConfig;
}) {
	const context = await routingContext();
	const result = await fetchAccountWebApi<{ route: { id: string; version: number } }>("/api/account/settings/dynamic-routes", context.accessToken, {
		method: "POST",
		body: JSON.stringify({ ...input, workspaceId: context.workspaceId }),
	});
	revalidatePath("/settings/routing");
	return result.route;
}

export async function updateDynamicRouteAction(routeId: string, input: {
	name?: string;
	description?: string | null;
	status?: "active" | "paused";
	config?: DynamicRouteConfig;
}) {
	const context = await routingContext();
	const result = await fetchAccountWebApi<{ success: true; version: number }>(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}`, context.accessToken, {
		method: "PUT",
		body: JSON.stringify(input),
	});
	revalidatePath("/settings/routing");
	return result;
}

export async function attachDynamicRouteKeysAction(routeId: string, keyIds: string[]) {
	const context = await routingContext();
	await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}/keys`, context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ keyIds }),
	});
	revalidatePath("/settings/routing");
}

export async function deployDynamicRouteVersionAction(routeId: string, version: number) {
	const context = await routingContext();
	await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}/versions/${version}/deploy`, context.accessToken, { method: "POST" });
	revalidatePath("/settings/routing");
}

export async function deleteDynamicRouteAction(routeId: string, confirmName: string) {
	const context = await routingContext();
	await fetchAccountWebApi(`/api/account/settings/dynamic-routes/${encodeURIComponent(routeId)}?confirmName=${encodeURIComponent(confirmName)}`, context.accessToken, {
		method: "DELETE",
	});
	revalidatePath("/settings/routing");
}
