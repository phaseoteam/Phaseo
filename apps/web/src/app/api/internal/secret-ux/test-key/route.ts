import { NextResponse } from "next/server";

import { AI_STATS_GATEWAY_BASE_URL } from "@/lib/gateway/secretReveal";
import { createClient } from "@/utils/supabase/server";

function gatewayBaseUrl() {
	const raw = (
		process.env.NEXT_PUBLIC_GATEWAY_API_URL ??
		process.env.NEXT_PUBLIC_API_URL ??
		AI_STATS_GATEWAY_BASE_URL
	).replace(/\/+$/, "");
	return raw.endsWith("/v1") ? raw : `${raw}/v1`;
}

function looksLikeAiStatsKey(value: string) {
	return /^aistats(_v\d+)?_sk_[A-Za-z0-9_-]{16,}$/.test(value);
}

export async function POST(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json(
			{ ok: false, message: "Sign in to test API keys." },
			{ status: 401 },
		);
	}

	const body = await request.json().catch(() => ({}));
	const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
	if (!apiKey || !looksLikeAiStatsKey(apiKey)) {
		return NextResponse.json(
			{ ok: false, message: "This does not look like an AI Stats API key." },
			{ status: 400 },
		);
	}

	try {
		const response = await fetch(
			`${gatewayBaseUrl()}/models?endpoints=chat/completions`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				cache: "no-store",
			},
		);
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			const message =
				typeof payload?.error?.message === "string"
					? payload.error.message
					: typeof payload?.message === "string"
						? payload.message
						: response.status === 401
							? "The gateway rejected this key."
							: "The gateway could not verify this key.";
			return NextResponse.json(
				{ ok: false, status: response.status, message },
				{ status: 400 },
			);
		}

		const modelCount = Array.isArray(payload?.data)
			? payload.data.length
			: Array.isArray(payload)
				? payload.length
				: null;
		return NextResponse.json(
			{ ok: true, status: response.status, modelCount },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return NextResponse.json(
			{
				ok: false,
				message: "Could not reach the gateway to test this key.",
			},
			{ status: 502 },
		);
	}
}
