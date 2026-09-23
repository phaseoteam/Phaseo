import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { publishWorkspaceMutation } from "@/core/workspace-publication";

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
	const bindings = getBindings();
	const controlSecret = bindings.PHASEO_CONTROL_SECRET?.trim();
	if (!controlSecret) {
		return json(
			{ ok: false, error: "control_secret_missing", message: "PHASEO_CONTROL_SECRET is not configured" },
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
	// Website service authorization requires BOTH configured credentials. An
	// ordinary caller remains scoped to its own authenticated workspace.
	const authorization = req.headers.get("authorization") ?? "";
	const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
	const serviceKey = bindings.PHASEO_CONTROL_KEY?.trim();
	const serviceAuthorized = !!serviceKey && timingSafeEqual(bearer, serviceKey);
	const auth = serviceAuthorized ? null : await guardAuth(req, { useKvCache: false });
	if (auth && !auth.ok) return (auth as GuardErr).response;

	const url = new URL(req.url);
	const targetWorkspaceId = url.pathname.split("/").at(-2) ?? "";
	if (!targetWorkspaceId || targetWorkspaceId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(targetWorkspaceId)) {
		return json({ ok: false, error: "workspace_id_required" }, 400, { "Cache-Control": "no-store" });
	}
	if (auth?.ok && targetWorkspaceId !== auth.value.workspaceId) {
		return json(
			{ ok: false, error: "forbidden", message: "Workspace does not belong to the authenticated team" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}

	try {
		const version = await publishWorkspaceMutation(targetWorkspaceId);
		return json(
			{
				ok: true,
				workspace_id: targetWorkspaceId,
				cache_version: version.policyVersion,
				context_version: version.contextVersion,
				message: "Workspace cache invalidation published; existing leases expire normally",
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch {
		return json(
			{ ok: false, error: "workspace_publication_failed" },
			503,
			{ "Cache-Control": "no-store" },
		);
	}
}

export const workspacePolicyRoutes = new Hono<Env>();

workspacePolicyRoutes.post("/:id/invalidate", withRuntime(handleInvalidateWorkspacePolicy));
