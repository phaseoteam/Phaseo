// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime } from "../../utils";
import { authenticate } from "@pipeline/before/auth";
import type { AuthFailure } from "@pipeline/before/auth";
import { err } from "@pipeline/before/http";
import { generatePublicId } from "@pipeline/before/genId";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { getBatchFileMeta, saveBatchFileMeta } from "@core/batch-jobs";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function toText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function proxyResponse(upstream: Response): Response {
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: upstream.headers,
	});
}

async function parseUpstreamJson(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
}

async function fetchOpenAiFiles(args: {
	endpointPath: string;
	method: string;
	body?: BodyInit | null;
	contentType?: string | null;
}): Promise<Response> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	let keyInfo: { key: string };
	try {
		keyInfo = resolveProviderKey(
			{ providerId: OPENAI_PROVIDER_ID, byokMeta: [] },
			() => bindings.OPENAI_API_KEY,
		);
	} catch {
		return new Response(
			JSON.stringify({
				error: {
					type: "upstream_error",
					reason: "openai_key_missing",
				},
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
	}
	const headers = new Headers({
		Authorization: `Bearer ${keyInfo.key}`,
	});
	if (args.contentType) {
		headers.set("Content-Type", args.contentType);
	}
	return fetch(`${resolveOpenAiBaseUrl(bindings)}${args.endpointPath}`, {
		method: args.method,
		headers,
		body: args.body ?? undefined,
	});
}

async function handleUpload(req: Request) {
	const requestId = generatePublicId();
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason, request_id: requestId });
    }
	const upstream = await fetchOpenAiFiles({
		endpointPath: "/files",
		method: "POST",
		body: req.body,
		contentType: req.headers.get("content-type"),
	});
	const payload = await parseUpstreamJson(upstream);
	if (upstream.ok && payload) {
		const fileId = toText(payload?.id);
		if (fileId) {
			await saveBatchFileMeta(auth.workspaceId, fileId, {
				provider: OPENAI_PROVIDER_ID,
				status: toText(payload?.status) ?? "uploaded",
				purpose: toText(payload?.purpose),
				filename: toText(payload?.filename),
				bytes: typeof payload?.bytes === "number" ? payload.bytes : null,
				keySource: "gateway",
				byokKeyId: null,
			}).catch((storeErr) => {
				console.error("file_job_meta_store_failed", {
					error: storeErr,
					workspaceId: auth.workspaceId,
					fileId,
				});
			});
		}
	}
	return proxyResponse(upstream);
}

async function handleList(req: Request) {
	const requestId = generatePublicId();
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason, request_id: requestId });
    }
	return err("not_supported", {
		reason: "file_list_not_supported_with_shared_gateway_key",
		request_id: requestId,
		workspace_id: auth.workspaceId,
	});
}

async function handleRetrieve(req: Request, id: string) {
	const requestId = generatePublicId();
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return err("unauthorised", { reason, request_id: requestId });
    }
	const fileId = String(id ?? "").trim();
	if (!fileId) {
		return err("validation_error", {
			reason: "missing_file_id",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const owned = await getBatchFileMeta(auth.workspaceId, fileId);
	if (!owned) {
		return err("not_found", {
			reason: "file_not_found_or_not_owned",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			file_id: fileId,
		});
	}

	const upstream = await fetchOpenAiFiles({
		endpointPath: `/files/${encodeURIComponent(fileId)}`,
		method: "GET",
	});
	const payload = await parseUpstreamJson(upstream);
	if (upstream.ok && payload) {
		await saveBatchFileMeta(auth.workspaceId, fileId, {
			provider: OPENAI_PROVIDER_ID,
			status: toText(payload?.status) ?? owned.status ?? "available",
			purpose: toText(payload?.purpose) ?? owned.purpose ?? null,
			filename: toText(payload?.filename) ?? owned.filename ?? null,
			bytes: typeof payload?.bytes === "number" ? payload.bytes : owned.bytes ?? null,
			keySource: owned.keySource ?? "gateway",
			byokKeyId: owned.byokKeyId ?? null,
		}).catch((storeErr) => {
			console.error("file_job_meta_refresh_failed", {
				error: storeErr,
				workspaceId: auth.workspaceId,
				fileId,
			});
		});
	}
	return proxyResponse(upstream);
}

async function handleRetrieveContent(req: Request, id: string) {
	const requestId = generatePublicId();
	const auth = await authenticate(req);
	if (!auth.ok) {
		const reason = (auth as AuthFailure).reason;
		return err("unauthorised", { reason, request_id: requestId });
	}
	const fileId = String(id ?? "").trim();
	if (!fileId) {
		return err("validation_error", {
			reason: "missing_file_id",
			request_id: requestId,
			workspace_id: auth.workspaceId,
		});
	}
	const owned = await getBatchFileMeta(auth.workspaceId, fileId);
	if (!owned) {
		return err("not_found", {
			reason: "file_not_found_or_not_owned",
			request_id: requestId,
			workspace_id: auth.workspaceId,
			file_id: fileId,
		});
	}

	const upstream = await fetchOpenAiFiles({
		endpointPath: `/files/${encodeURIComponent(fileId)}/content`,
		method: "GET",
	});
	return proxyResponse(upstream);
}

export const filesRoutes = new Hono<Env>();

filesRoutes.post("/", withRuntime(handleUpload));
filesRoutes.get("/", withRuntime(handleList));
filesRoutes.get("/:id", withRuntime((req) => handleRetrieve(req, (req as any).param?.("id") ?? req.url.split("/").pop() ?? "")));
filesRoutes.get("/:id/content", withRuntime((req) => handleRetrieveContent(req, (req as any).param?.("id") ?? new URL(req.url).pathname.split("/").slice(-2, -1)[0] ?? "")));

