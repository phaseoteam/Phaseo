import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";

function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

async function handleInvalidateWorkspacePolicy(req: Request) {
	const auth = await guardAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const { workspaceId } = auth.value;

	const bindings = getBindings();
	const controlSecret = bindings.GATEWAY_CONTROL_SECRET?.trim();
	if (!controlSecret) {
		return json(
			{ ok: false, error: "control_secret_missing", message: "GATEWAY_CONTROL_SECRET is not configured" },
			503,
			{ "Cache-Control": "no-store" },
		);
	}

	const providedSecret = req.headers.get("x-control-secret")?.trim() ?? "";
	if (!timingSafeEqual(providedSecret, controlSecret)) {
		return json(
			{ ok: false, error: "forbidden", message: "Invalid control secret" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}

	const url = new URL(req.url);
	const targetWorkspaceId = url.pathname.split("/").at(-2) ?? "";
	if (!targetWorkspaceId) {
		return json({ ok: false, error: "workspace_id_required" }, 400, { "Cache-Control": "no-store" });
	}
	if (targetWorkspaceId !== workspaceId) {
		return json(
			{ ok: false, error: "forbidden", message: "Workspace does not belong to the authenticated team" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}

	try {
		const version = await bumpWorkspacePolicyVersion(targetWorkspaceId);
		return json(
			{
				ok: true,
				workspace_id: targetWorkspaceId,
				cache_version: version,
				message: "Workspace policy cache invalidated globally",
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" },
		);
	}
}

export const workspacePolicyRoutes = new Hono<Env>();

workspacePolicyRoutes.post("/:id/invalidate", withRuntime(handleInvalidateWorkspacePolicy));
