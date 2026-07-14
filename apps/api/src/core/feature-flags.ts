// Purpose: Server-side feature gate checks for Gateway surfaces.
// Why: Keeps rollout gates out of route handlers while allowing Statsig-managed access.

import type { AuthSuccess } from "@pipeline/before/auth";
import type { GatewayBindings } from "@/runtime/env.types";
import { getBindings } from "@/runtime/env";

const DEFAULT_BATCH_API_GATE = "gateway_batch_api";

type StatsigGateResponse = {
	value?: unknown;
	name?: unknown;
	results?: Record<string, { value?: unknown }>;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isLocalTestBypass(bindings: Partial<GatewayBindings>): boolean {
	return (
		process.env.NODE_ENV === "test" ||
		normalizeText(bindings.GATEWAY_LOCAL_TESTING_MODE)?.toLowerCase() === "true"
	);
}

function resolveStatsigServerKey(bindings: Partial<GatewayBindings>): string | null {
	return (
		normalizeText(bindings.STATSIG_SERVER_KEY) ??
		normalizeText(bindings.STATSIG_SERVER_API_KEY)
	);
}

function resolveStatsigEnvironmentTier(bindings: Partial<GatewayBindings>): "production" | "staging" | "development" {
	const configured = normalizeText(bindings.STATSIG_ENVIRONMENT_TIER)?.toLowerCase();
	if (configured === "production" || configured === "staging" || configured === "development") {
		return configured;
	}
	return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function getBatchApiFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_BATCH_API_GATE) ?? DEFAULT_BATCH_API_GATE;
}

export async function isBatchApiAccessEnabled(
	auth: AuthSuccess,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	const gateName = getBatchApiFeatureGateName(bindings);
	const statsigKey = resolveStatsigServerKey(bindings);
	if (!statsigKey) {
		return isLocalTestBypass(bindings);
	}

	const user = {
		userID: auth.userId ?? auth.apiKeyId ?? auth.workspaceId,
		customIDs: {
			workspaceID: auth.workspaceId,
			apiKeyID: auth.apiKeyId,
			apiKeyKid: auth.apiKeyKid,
		},
		custom: {
			workspace_id: auth.workspaceId,
			api_key_id: auth.apiKeyId,
			api_key_ref: auth.apiKeyRef,
			api_key_kid: auth.apiKeyKid,
			is_internal: auth.internal === true,
			surface: "gateway_batch_api",
		},
		statsigEnvironment: {
			tier: resolveStatsigEnvironmentTier(bindings),
		},
		statsigMetadata: {
			sdkType: "ai-stats-gateway-api",
			exposureLoggingDisabled: false,
		},
	};

	try {
		const response = await fetch("https://api.statsig.com/v1/check_gate", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"statsig-api-key": statsigKey,
			},
			body: JSON.stringify({
				gateName,
				user,
			}),
		});
		if (!response.ok) return false;
		const payload = (await response.json().catch(() => null)) as StatsigGateResponse | null;
		if (!payload || typeof payload !== "object") return false;
		if (typeof payload.value === "boolean") return payload.value;
		const nested = payload.results?.[gateName]?.value;
		return typeof nested === "boolean" ? nested : false;
	} catch (error) {
		console.error("batch_api_statsig_gate_check_failed", {
			error,
			gateName,
			workspaceId: auth.workspaceId,
		});
		return false;
	}
}
