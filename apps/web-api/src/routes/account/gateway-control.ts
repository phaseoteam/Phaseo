import type { Env } from "@/env";

// Settings pages whose writes must go through the gateway's control API (for its
// validation, audit events and cache publishes) forward the user's session token
// and workspace. The gateway authenticates the session and checks the role.

export type GatewayResult = { status: number; payload: any };

function gatewayOrigin(env: Env): string {
	return (
		env.GATEWAY_API_ORIGIN ??
		env.PHASEO_GATEWAY_URL ??
		env.AI_STATS_GATEWAY_URL ??
		env.NEXT_PUBLIC_GATEWAY_API_URL ??
		env.NEXT_PUBLIC_API_URL ??
		"https://api.phaseo.app"
	).replace(/\/$/, "");
}

export async function callGatewayControl(args: {
	env: Env;
	request: Request;
	workspaceId: string;
	/** Path under the gateway origin, such as /v1/rate-limits/policies. */
	path: string;
	method?: string;
	body?: unknown;
	/** Log event name when the gateway cannot be reached. */
	failureEvent: string;
}): Promise<GatewayResult> {
	const authorization = args.request.headers.get("authorization");
	if (!authorization) return { status: 401, payload: { error: "unauthorized" } };
	if (!args.workspaceId.trim()) return { status: 400, payload: { error: "bad_request", message: "workspaceId is required" } };
	try {
		const response = await fetch(`${gatewayOrigin(args.env)}${args.path}`, {
			method: args.method ?? "GET",
			headers: {
				authorization,
				"x-phaseo-workspace-id": args.workspaceId,
				...(args.body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: args.body === undefined ? undefined : JSON.stringify(args.body),
			signal: AbortSignal.timeout(10_000),
		});
		return {
			status: response.status,
			payload: await response.json().catch(() => ({ error: "gateway_unavailable" })),
		};
	} catch (error) {
		console.error(args.failureEvent, {
			error: error instanceof Error ? error.message : String(error),
		});
		return { status: 503, payload: { error: "gateway_unavailable" } };
	}
}
