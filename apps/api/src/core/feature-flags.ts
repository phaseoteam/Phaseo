// Purpose: Server-side feature gate checks for Gateway surfaces.
// Why: Keeps rollout gates out of route handlers while allowing Statsig-managed access.

import type { AuthSuccess } from "@pipeline/before/auth";
import type { GatewayBindings } from "@/runtime/env.types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";

const DEFAULT_BATCH_API_GATE = "gateway_batch_api";
const DEFAULT_REALTIME_VOICE_GATE = "gateway_realtime_voice";
const DEFAULT_GATEWAY_IO_LOGGING_GATE = "gateway_io_logging";
const WORKSPACE_OWNER_CACHE_TTL_MS = 5 * 60 * 1000;

type StatsigGateSubject = {
	workspaceId: string;
	apiKeyId?: string | null;
	apiKeyRef?: string | null;
	apiKeyKid?: string | null;
	userId?: string | null;
	internal?: boolean;
	surface: string;
};

type StatsigGateResponse = {
	value?: unknown;
	name?: unknown;
	results?: Record<string, { value?: unknown }>;
};

const workspaceOwnerCache = new Map<string, { userId: string | null; expiresAt: number }>();

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

export function getRealtimeVoiceFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_REALTIME_VOICE_GATE) ?? DEFAULT_REALTIME_VOICE_GATE;
}

export function getGatewayIoLoggingFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_GATEWAY_IO_LOGGING_GATE) ?? DEFAULT_GATEWAY_IO_LOGGING_GATE;
}

async function resolveWorkspaceOwnerUserId(workspaceId: string): Promise<string | null> {
	const now = Date.now();
	const cached = workspaceOwnerCache.get(workspaceId);
	if (cached && cached.expiresAt > now) return cached.userId;

	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workspaces")
			.select("owner_user_id")
			.eq("id", workspaceId)
			.maybeSingle();
		if (error) throw error;
		const userId = normalizeText((data as { owner_user_id?: unknown } | null)?.owner_user_id);
		workspaceOwnerCache.set(workspaceId, { userId, expiresAt: now + WORKSPACE_OWNER_CACHE_TTL_MS });
		return userId;
	} catch (error) {
		console.error("gateway_feature_gate_workspace_owner_lookup_failed", {
			workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
		workspaceOwnerCache.set(workspaceId, { userId: null, expiresAt: now + 60_000 });
		return null;
	}
}

async function isStatsigGateEnabled(
	gateName: string,
	subject: StatsigGateSubject,
	bindings: Partial<GatewayBindings>,
): Promise<boolean> {
	const statsigKey = resolveStatsigServerKey(bindings);
	if (!statsigKey) return isLocalTestBypass(bindings);

	const userId = normalizeText(subject.userId) ?? await resolveWorkspaceOwnerUserId(subject.workspaceId);
	if (!userId) return false;

	const user = {
		userID: userId,
		customIDs: {
			workspaceID: subject.workspaceId,
			apiKeyID: subject.apiKeyId ?? undefined,
			apiKeyKid: subject.apiKeyKid ?? undefined,
		},
		custom: {
			workspace_id: subject.workspaceId,
			api_key_id: subject.apiKeyId ?? null,
			api_key_ref: subject.apiKeyRef ?? null,
			api_key_kid: subject.apiKeyKid ?? null,
			is_internal: subject.internal === true,
			surface: subject.surface,
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
			body: JSON.stringify({ gateName, user }),
		});
		if (!response.ok) return false;
		const payload = (await response.json().catch(() => null)) as StatsigGateResponse | null;
		if (!payload || typeof payload !== "object") return false;
		if (typeof payload.value === "boolean") return payload.value;
		const nested = payload.results?.[gateName]?.value;
		return typeof nested === "boolean" ? nested : false;
	} catch (error) {
		console.error("gateway_statsig_gate_check_failed", {
			error,
			gateName,
			workspaceId: subject.workspaceId,
			surface: subject.surface,
		});
		return false;
	}
}

export async function isBatchApiAccessEnabled(
	auth: AuthSuccess,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	const gateName = getBatchApiFeatureGateName(bindings);
	return isStatsigGateEnabled(gateName, {
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
		userId: auth.userId,
		internal: auth.internal,
		surface: "gateway_batch_api",
	}, bindings);
}

export async function isRealtimeVoiceAccessEnabled(
	auth: AuthSuccess,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	return isStatsigGateEnabled(getRealtimeVoiceFeatureGateName(bindings), {
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
		userId: auth.userId,
		internal: auth.internal,
		surface: "gateway_realtime_voice",
	}, bindings);
}

export async function isGatewayIoLoggingFeatureEnabled(
	subject: Omit<StatsigGateSubject, "surface">,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	return isStatsigGateEnabled(getGatewayIoLoggingFeatureGateName(bindings), {
		...subject,
		surface: "gateway_io_logging",
	}, bindings);
}
