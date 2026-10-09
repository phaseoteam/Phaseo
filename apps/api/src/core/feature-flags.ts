// Purpose: Server-side feature gate checks for Gateway surfaces.
// Why: Keeps rollout gates out of route handlers while allowing Statsig-managed access.

import type { AuthSuccess } from "@pipeline/before/auth";
import type { GatewayBindings } from "@/runtime/env.types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { awaitShared } from "@core/shared-wait";

const DEFAULT_BATCH_API_GATE = "gateway_batch_api";
const DEFAULT_VIDEO_API_GATE = "gateway_video_api";
const DEFAULT_REALTIME_VOICE_GATE = "gateway_realtime_voice";
const DEFAULT_GATEWAY_IO_LOGGING_GATE = "gateway_io_logging";
const DEFAULT_DATA_CONTRIBUTION_GATE = "gateway_data_contribution";
const DEFAULT_AUTO_ROUTING_GATE = "gateway_auto_routing";
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
const STATSIG_GATE_CACHE_TTL_MS = 60_000;
const STATSIG_GATE_FAILURE_TTL_MS = 10_000;
const STATSIG_GATE_CACHE_MAX_ENTRIES = 10_000;
const STATSIG_SHARED_WAIT_MS = 1_500;
const statsigGateCache = new Map<string, { value: boolean; expiresAt: number }>();
const statsigGateInflight = new Map<string, Promise<boolean>>();

export function __resetFeatureGateCacheForTests(): void {
	statsigGateCache.clear();
	statsigGateInflight.clear();
	workspaceOwnerCache.clear();
}

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

export function getVideoApiFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_VIDEO_API_GATE) ?? DEFAULT_VIDEO_API_GATE;
}

export function getRealtimeVoiceFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_REALTIME_VOICE_GATE) ?? DEFAULT_REALTIME_VOICE_GATE;
}

export function getGatewayIoLoggingFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_GATEWAY_IO_LOGGING_GATE) ?? DEFAULT_GATEWAY_IO_LOGGING_GATE;
}

export function getDataContributionFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_DATA_CONTRIBUTION_GATE) ?? DEFAULT_DATA_CONTRIBUTION_GATE;
}

export function getAutoRoutingFeatureGateName(bindings: Partial<GatewayBindings> = getBindings()): string {
	return normalizeText(bindings.STATSIG_AUTO_ROUTING_GATE) ?? DEFAULT_AUTO_ROUTING_GATE;
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

	// Gate checks are external HTTP calls made on request and audit paths; reuse
	// a recent evaluation for the same subject instead of calling every time.
	const tier = resolveStatsigEnvironmentTier(bindings);
	const cacheKey = JSON.stringify([
		gateName, tier, userId, subject.workspaceId, subject.apiKeyId ?? null, subject.apiKeyRef ?? null,
		subject.apiKeyKid ?? null, subject.internal === true, subject.surface,
	]);
	const cached = statsigGateCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	const pending = statsigGateInflight.get(cacheKey);
	if (pending) {
		// The evaluation may belong to another request; never wait on it unboundedly.
		const shared = await awaitShared(pending, STATSIG_SHARED_WAIT_MS);
		if (shared.settled) return shared.value;
	}
	const evaluation = evaluateStatsigGate(gateName, subject, userId, tier, statsigKey)
		.then(({ value, definitive }) => {
			rememberStatsigGate(cacheKey, value, definitive ? STATSIG_GATE_CACHE_TTL_MS : STATSIG_GATE_FAILURE_TTL_MS);
			return value;
		})
		.finally(() => statsigGateInflight.delete(cacheKey));
	statsigGateInflight.set(cacheKey, evaluation);
	return evaluation;
}

function rememberStatsigGate(cacheKey: string, value: boolean, ttlMs: number): void {
	statsigGateCache.delete(cacheKey);
	statsigGateCache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
	while (statsigGateCache.size > STATSIG_GATE_CACHE_MAX_ENTRIES) {
		const oldest = statsigGateCache.keys().next();
		if (oldest.done) break;
		statsigGateCache.delete(oldest.value);
	}
}

async function evaluateStatsigGate(
	gateName: string,
	subject: StatsigGateSubject,
	userId: string,
	tier: "production" | "staging" | "development",
	statsigKey: string,
): Promise<{ value: boolean; definitive: boolean }> {
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
			tier,
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
			signal: AbortSignal.timeout(2_000),
		});
		if (!response.ok) return { value: false, definitive: false };
		const payload = (await response.json().catch(() => null)) as StatsigGateResponse | null;
		if (!payload || typeof payload !== "object") return { value: false, definitive: false };
		if (typeof payload.value === "boolean") return { value: payload.value, definitive: true };
		const nested = payload.results?.[gateName]?.value;
		return typeof nested === "boolean" ? { value: nested, definitive: true } : { value: false, definitive: false };
	} catch (error) {
		console.error("gateway_statsig_gate_check_failed", {
			error,
			gateName,
			workspaceId: subject.workspaceId,
			surface: subject.surface,
		});
		return { value: false, definitive: false };
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

export async function isVideoApiAccessEnabled(
	auth: AuthSuccess | Omit<AuthSuccess, "ok">,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	return isStatsigGateEnabled(getVideoApiFeatureGateName(bindings), {
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
		userId: auth.userId,
		internal: auth.internal,
		surface: "gateway_video_api",
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

export async function isDataContributionAccessEnabled(
	subject: Omit<StatsigGateSubject, "surface">,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	return isStatsigGateEnabled(getDataContributionFeatureGateName(bindings), {
		...subject,
		surface: "gateway_data_contribution",
	}, bindings);
}

export async function isAutoRoutingAccessEnabled(
	auth: AuthSuccess | Omit<AuthSuccess, "ok">,
	bindings: Partial<GatewayBindings> = getBindings(),
): Promise<boolean> {
	return isStatsigGateEnabled(getAutoRoutingFeatureGateName(bindings), {
		workspaceId: auth.workspaceId,
		apiKeyId: auth.apiKeyId,
		apiKeyRef: auth.apiKeyRef,
		apiKeyKid: auth.apiKeyKid,
		userId: auth.userId,
		internal: auth.internal,
		surface: "gateway_auto_routing",
	}, bindings);
}
