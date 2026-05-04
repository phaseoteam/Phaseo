import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { generatePublicId } from "@pipeline/before/genId";
import { err } from "@pipeline/before/http";
import { getAsyncOperation } from "@core/async-operations";
import {
	buildAsyncNotificationData,
	resolveAsyncNotificationKind,
} from "@core/async-notifications";
import { withRuntime, json } from "../../utils";

const DEFAULT_POLL_INTERVAL_MS = 2500;
const MIN_POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 10000;

export function parseAsyncWebsocketOptions(url: URL): {
	intervalMs: number;
	closeOnTerminal: boolean;
} {
	const rawInterval = String(url.searchParams.get("interval_ms") ?? "").trim();
	const parsedInterval = rawInterval ? Number(rawInterval) : Number.NaN;
	const intervalMs = Number.isFinite(parsedInterval)
		? Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, Math.trunc(parsedInterval)))
		: DEFAULT_POLL_INTERVAL_MS;
	const rawCloseOnTerminal = String(url.searchParams.get("close_on_terminal") ?? "true").trim().toLowerCase();
	const closeOnTerminal = !["0", "false", "no", "off"].includes(rawCloseOnTerminal);
	return { intervalMs, closeOnTerminal };
}

function toTerminalStatus(value: unknown): "completed" | "failed" | "cancelled" | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "completed") return "completed";
	if (normalized === "failed") return "failed";
	if (normalized === "cancelled") return "cancelled";
	return null;
}

function sendSocketJson(socket: WebSocket, payload: Record<string, unknown>) {
	try {
		socket.send(JSON.stringify(payload));
	} catch {
		// Ignore socket send failures; close handlers will clean up.
	}
}

async function asyncJobsWsHandler(req: Request): Promise<Response> {
	if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
		return json(
			{
				error: {
					code: "websocket_upgrade_required",
					message: "Use WebSocket upgrade for async job updates.",
				},
			},
			426,
			{ Upgrade: "websocket" },
		);
	}

	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: generatePublicId() });
	}

	const url = new URL(req.url);
	const segments = url.pathname.split("/").filter(Boolean);
	const kind = resolveAsyncNotificationKind(segments[segments.length - 3] ?? "");
	const internalId = decodeURIComponent(segments[segments.length - 2] ?? "");
	if (!kind || !internalId) {
		return err("validation_error", {
			reason: "invalid_async_job_path",
			request_id: generatePublicId(),
			workspace_id: auth.workspaceId,
		});
	}

	const record = await getAsyncOperation(auth.workspaceId, kind, internalId);
	if (!record) {
		return err("not_found", {
			reason: "async_job_not_found_or_not_owned",
			request_id: generatePublicId(),
			workspace_id: auth.workspaceId,
		});
	}

	const options = parseAsyncWebsocketOptions(url);
	const pair = new WebSocketPair();
	const client = pair[0];
	const server = pair[1];
	server.accept();

	let closed = false;
	let lastSignature = "";
	let intervalHandle: ReturnType<typeof setInterval> | null = null;

	const cleanup = () => {
		if (closed) return;
		closed = true;
		if (intervalHandle) {
			clearInterval(intervalHandle);
			intervalHandle = null;
		}
		try {
			server.close(1000, "closed");
		} catch {
			// ignore
		}
	};

	const emitCurrentState = async (eventType = "job.snapshot"): Promise<void> => {
		const current = await getAsyncOperation(auth.workspaceId, kind, internalId);
		if (!current) {
			sendSocketJson(server, {
				type: "job.deleted",
				data: {
					id: internalId,
					kind,
				},
			});
			cleanup();
			return;
		}
		const data = await buildAsyncNotificationData({
			baseUrl: url.origin,
			record: current,
		});
		if (!data) return;
		const signature = JSON.stringify({
			status: current.status,
			updatedAt: current.updatedAt,
			data,
		});
		if (signature === lastSignature && eventType !== "job.snapshot") return;
		lastSignature = signature;
		sendSocketJson(server, {
			type: eventType,
			data,
		});
		if (options.closeOnTerminal && toTerminalStatus((data as any)?.status)) {
			cleanup();
		}
	};

	server.addEventListener("close", cleanup);
	server.addEventListener("error", cleanup);
	server.addEventListener("message", async (event) => {
		const text = typeof event.data === "string" ? event.data : "";
		if (text === "ping") {
			sendSocketJson(server, { type: "pong" });
			return;
		}
		if (text === "refresh") {
			await emitCurrentState("job.updated");
		}
	});

	await emitCurrentState("job.snapshot");
	if (!closed) {
		intervalHandle = setInterval(() => {
			void emitCurrentState("job.updated");
		}, options.intervalMs);
	}

	return new Response(null, {
		status: 101,
		webSocket: client,
	} as ResponseInit);
}

export const asyncJobsRoutes = new Hono<Env>();

asyncJobsRoutes.get("/:kind/:id/ws", withRuntime(asyncJobsWsHandler));
