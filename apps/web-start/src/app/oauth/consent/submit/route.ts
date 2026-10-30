import { NextResponse } from "next/server";

import {
	approveAuthorizationAction,
	denyAuthorizationAction,
} from "@/app/(auth)/oauth/consent/actions";

export async function POST(request: Request) {
	const origin = request.headers.get("origin");
	if (!origin || origin !== new URL(request.url).origin) {
		return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	}

	if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
		return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
	}

	const input = await request.json().catch(() => null);
	if (!input || typeof input !== "object") {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const result = input.operation === "approve"
		? await approveAuthorizationAction(input)
		: input.operation === "deny"
			? await denyAuthorizationAction(input)
			: { error: "Unsupported consent operation" };

	return NextResponse.json(result, {
		headers: { "Cache-Control": "no-store" },
	});
}
