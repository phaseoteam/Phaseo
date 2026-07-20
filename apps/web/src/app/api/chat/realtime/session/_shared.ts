import { NextResponse } from "next/server";
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

function normalizeGatewayBaseUrl(value: string | undefined): string {
	const trimmed = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
	const base = trimmed || PUBLIC_GATEWAY_BASE_URL;
	const withoutTrailingSlash = base.replace(/\/+$/, "");
	return withoutTrailingSlash.endsWith("/v1")
		? withoutTrailingSlash
		: `${withoutTrailingSlash}/v1`;
}

export async function proxyRealtimeSessionAction(args: {
	sessionId: string;
	action: "connected" | "extend" | "usage" | "finalize";
	body?: Record<string, unknown>;
}) {
	let auth;
	try {
		auth = await resolveChatGatewayContext();
	} catch (error) {
		if (error instanceof ChatGatewayAuthError) {
			return NextResponse.json(
				{ error: error.code, message: error.message },
				{ status: error.status },
			);
		}
		return NextResponse.json(
			{
				error: "chat_auth_failed",
				message: "Unable to authenticate this realtime request.",
			},
			{ status: 500 },
		);
	}

	const profile = await getServerStatsigProfile(auth.userId);
	if (!isBetaFeatureEnabled(profile, REALTIME_VOICE_BETA_FEATURE)) {
		return NextResponse.json(
			{
				error: "realtime_voice_disabled",
				message: "Realtime voice is disabled for this account.",
			},
			{ status: 403 },
		);
	}

	const gatewayBaseUrl = normalizeGatewayBaseUrl(process.env.AI_STATS_GATEWAY_URL);
	let upstream: Response;
	try {
		upstream = await fetch(
			`${gatewayBaseUrl}/realtime/sessions/${encodeURIComponent(args.sessionId)}/${args.action}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${auth.apiKey}`,
					"x-app-id": "ai-stats-chat",
					"x-app-name": "AI Stats Chat",
					"x-title": "AI Stats Chat",
					"http-referer": "https://ai-stats.phaseo.app/chat",
				},
				body: JSON.stringify(args.body ?? {}),
				cache: "no-store",
			},
		);
	} catch (error) {
		return NextResponse.json(
			{
				error: "gateway_unreachable",
				message:
					error instanceof Error
						? error.message
						: "Could not reach the gateway.",
			},
			{ status: 502 },
		);
	}

	const payload = await upstream.json().catch(() => null);
	return NextResponse.json(payload ?? {}, { status: upstream.status });
}
