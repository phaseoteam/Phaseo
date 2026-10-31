import { createFileRoute } from "@tanstack/react-router";

import {
	approveAuthorizationAction,
	denyAuthorizationAction,
} from "@/app/(auth)/oauth/consent/actions";

async function handlePost(request: Request) {
	const origin = request.headers.get("origin");
	if (!origin || origin !== new URL(request.url).origin) {
		return Response.json({ error: "Invalid request origin" }, { status: 403 });
	}

	if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
		return Response.json({ error: "Expected application/json" }, { status: 415 });
	}

	const input = await request.json().catch(() => null);
	if (!input || typeof input !== "object") {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const result = input.operation === "approve"
		? await approveAuthorizationAction(input)
		: input.operation === "deny"
			? await denyAuthorizationAction(input)
			: { error: "Unsupported consent operation" };

	return Response.json(result, {
		headers: { "Cache-Control": "no-store" },
	});
}

export const Route = createFileRoute("/oauth/consent/submit/")({
	server: {
		handlers: {
			POST: ({ request }) => handlePost(request),
		},
	},
});
