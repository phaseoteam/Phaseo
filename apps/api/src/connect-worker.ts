// phaseo-connect: the Phaseo Connect relay between the desktop app and its
// phones, at connect.phaseo.app. One ConnectRoom Durable Object per desktop.
// Deploying a Worker restarts its Durable Objects and ends their WebSockets, so
// the relay lives apart from phaseo-gateway (deployed on every merge); the
// desktop and phone reconnect by themselves, and held envelopes survive in
// SQLite. Deploying it is a manual step (docs/operations/phaseo-connect.md).
//
// GET /v1/desktop/:desktopId  (WebSocket) Authorization: Bearer <the desktop's gateway key>
// GET /v1/phone/:desktopId    (WebSocket) Authorization: Bearer <relay token the desktop registered>
import { authenticate } from "@/pipeline/before/auth";
import { clearRuntime, configureRuntime, runWithRequestScope, type GatewayBindings } from "@/runtime/env";
import {
	CONNECT_KEY_HASH_HEADER,
	CONNECT_ROLE_HEADER,
	CONNECT_WORKSPACE_HEADER,
	ConnectRoom,
	sha256Hex,
} from "@/connect/connect-room";

export { ConnectRoom };

export type ConnectWorkerEnv = GatewayBindings & { CONNECT_ROOM: DurableObjectNamespace };
type GatewayAuth = Awaited<ReturnType<typeof authenticate>>;

const ROUTE = /^\/v1\/(desktop|phone)\/([A-Za-z0-9_-]{16,128})$/;

const json = (status: number, error: string) =>
	new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The gateway's own key check (cache, peppers, revocation, OAuth scopes and IP allowlists). */
async function authenticateGatewayKey(request: Request, env: GatewayBindings, ctx: ExecutionContext): Promise<GatewayAuth> {
	return runWithRequestScope(ctx.waitUntil.bind(ctx), async () => {
		configureRuntime(env);
		try {
			return await authenticate(request);
		} finally {
			clearRuntime();
		}
	});
}

export function createConnectWorker(auth: typeof authenticateGatewayKey = authenticateGatewayKey) {
	return {
		async fetch(request: Request, env: ConnectWorkerEnv, ctx: ExecutionContext): Promise<Response> {
			const url = new URL(request.url);
			const match = ROUTE.exec(url.pathname);
			if (!match || request.method !== "GET") return json(404, "not_found");
			if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json(426, "websocket_required");
			const [, role, desktopId] = match;

			// Only these headers reach the room, so a client can't supply the trusted x-connect-* ones.
			const headers = new Headers({ upgrade: "websocket", [CONNECT_ROLE_HEADER]: role });
			if (role === "desktop") {
				const result = await auth(request, env, ctx);
				if (result.ok === false) return json(result.reason === "db_error" ? 503 : 401, "unauthorized");
				headers.set(CONNECT_WORKSPACE_HEADER, result.workspaceId);
				headers.set(CONNECT_KEY_HASH_HEADER, await sha256Hex(result.apiKeyId));
			} else {
				// The room refuses a phone without a token by closing its socket with a reason the phone can read.
				const authorization = request.headers.get("authorization");
				if (authorization) headers.set("authorization", authorization);
			}
			const room = env.CONNECT_ROOM.get(env.CONNECT_ROOM.idFromName(desktopId));
			return room.fetch(new Request(`https://connect.internal/${role}`, { headers }));
		},
	};
}

export default createConnectWorker();
