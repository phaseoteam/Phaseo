import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
	ChatGatewayAuthError,
	resolveChatGatewayContext,
} from "@/lib/server/chatGatewayAuth";
import {
	REALTIME_VOICE_BETA_FEATURE,
	isBetaFeatureEnabled,
} from "@/lib/statsig/shared";
import { getServerStatsigProfile } from "@/lib/statsig/server";

const PUBLIC_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";

const requestSchema = z.object({
	provider: z.enum(["openai", "xai", "x-ai", "google", "google-ai-studio"]),
	model: z.string().trim().min(1).max(160),
	voice: z.string().trim().min(1).max(80).optional(),
	instructions: z.string().trim().max(4000).optional(),
});

function jsonError(status: number, error: string, message: string) {
	return NextResponse.json({ error, message }, { status });
}

function isSameOriginRequest(request: NextRequest): boolean {
	const origin = request.headers.get("origin");
	const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
	if (!origin || !host) return process.env.NODE_ENV !== "production";
	try {
		return new URL(origin).host.toLowerCase() === host.split(",", 1)[0]?.trim().toLowerCase();
	} catch {
		return false;
	}
}

function normalizeGatewayBaseUrl(value: string | undefined): string {
	const trimmed = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
	const base = trimmed || PUBLIC_GATEWAY_BASE_URL;
	const withoutTrailingSlash = base.replace(/\/+$/, "");
	return withoutTrailingSlash.endsWith("/v1")
		? withoutTrailingSlash
		: `${withoutTrailingSlash}/v1`;
}

function normalizeProviderForGateway(provider: z.infer<typeof requestSchema>["provider"]) {
	if (provider === "xai") return "x-ai";
	if (provider === "google") return "google-ai-studio";
	return provider;
}

function normalizeProviderForChat(provider: unknown) {
	const normalized = String(provider ?? "").trim().toLowerCase();
	if (normalized === "x-ai") return "xai";
	if (normalized === "google-ai-studio") return "google";
	return normalized;
}

function gatewayBaseToWebSocketUrl(gatewayBaseUrl: string, path: string): string {
	const base = new URL(gatewayBaseUrl.endsWith("/") ? gatewayBaseUrl : `${gatewayBaseUrl}/`);
	const url = path.startsWith("/")
		? new URL(path, base.origin)
		: new URL(path, base);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

function normalizeModelForGateway(provider: string, model: string) {
	const trimmed = model.trim();
	if (trimmed.includes("/")) return trimmed;
	if (provider === "openai") return `openai/${trimmed}`;
	if (provider === "x-ai") return `x-ai/${trimmed}`;
	return `google/${trimmed}`;
}

async function ensureRealtimeBetaEnabled(userId: string) {
	const profile = await getServerStatsigProfile(userId);
	return isBetaFeatureEnabled(profile, REALTIME_VOICE_BETA_FEATURE);
}

export async function POST(request: NextRequest) {
	if (!isSameOriginRequest(request)) {
		return jsonError(403, "invalid_request_origin", "This request origin is not allowed.");
	}
	let auth;
	try {
		auth = await resolveChatGatewayContext();
	} catch (error) {
		if (error instanceof ChatGatewayAuthError) {
			return jsonError(error.status, error.code, error.message);
		}
		return jsonError(
			500,
			"chat_auth_failed",
			"Unable to authenticate this realtime request.",
		);
	}

	const enabled = await ensureRealtimeBetaEnabled(auth.userId);
	if (!enabled) {
		return jsonError(
			403,
			"realtime_voice_disabled",
			"Realtime voice is disabled for this account.",
		);
	}

	const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return jsonError(
			400,
			"invalid_realtime_session_request",
			parsed.error.issues[0]?.message ?? "Invalid realtime session request.",
		);
	}

	const provider = normalizeProviderForGateway(parsed.data.provider);
	const gatewayBaseUrl = normalizeGatewayBaseUrl(process.env.AI_STATS_GATEWAY_URL);
	let upstream: Response;
	try {
		upstream = await fetch(`${gatewayBaseUrl}/realtime/sessions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${auth.apiKey}`,
				"x-app-id": "ai-stats-chat",
				"x-app-name": "AI Stats Chat",
				"x-title": "AI Stats Chat",
				"http-referer": "https://ai-stats.phaseo.app/chat",
			},
			body: JSON.stringify({
				provider,
				model: normalizeModelForGateway(provider, parsed.data.model),
				voice: parsed.data.voice,
				instructions: parsed.data.instructions,
				source: "chat",
				relay: true,
				metadata: {
					statSyncFeature: REALTIME_VOICE_BETA_FEATURE,
					userId: auth.userId,
					workspaceId: auth.workspaceId,
				},
			}),
			cache: "no-store",
		});
	} catch (error) {
		return jsonError(
			502,
			"gateway_unreachable",
			error instanceof Error ? error.message : "Could not reach the gateway.",
		);
	}

	const payload = await upstream.json().catch(() => null);
	if (!upstream.ok) {
		return NextResponse.json(
			payload ?? {
				error: "realtime_session_failed",
				message: `Gateway realtime session failed (${upstream.status}).`,
			},
			{ status: upstream.status },
		);
	}

	return NextResponse.json({
		...payload,
		provider: normalizeProviderForChat(payload?.provider),
		connect:
			payload?.connect?.url && payload?.clientSecret
				? {
						...payload.connect,
						transport: "websocket",
						url: gatewayBaseToWebSocketUrl(
							gatewayBaseUrl,
							String(payload.connect.url),
						),
						protocols: ["statsync-realtime", `rtsec.${String(payload.clientSecret)}`],
					}
				: payload?.connect,
	});
}
