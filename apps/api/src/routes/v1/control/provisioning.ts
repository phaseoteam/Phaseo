// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin, getBindings } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function parsePaginationParam(raw: string | null, fallback: number, max: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized <= 0) return fallback;
	if (normalized > max) return max;
	return normalized;
}

function parseOffsetParam(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

async function handleListKeys(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const teamId = url.searchParams.get("team_id");
	const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = parseOffsetParam(url.searchParams.get("offset"));

	if (!teamId) {
		return json({ ok: false, error: "team_id is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data: keys, error } = await supabase
			.from("provisioning_keys")
			.select("id, name, prefix, status, scopes, created_at, last_used_at")
			.eq("team_id", teamId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			throw new Error(error.message || "Failed to fetch keys");
		}

		const { count, error: countError } = await supabase
			.from("provisioning_keys")
			.select("*", { count: "exact", head: true })
			.eq("team_id", teamId);

		return json(
			{
				ok: true,
				limit,
				offset,
				total: count ?? 0,
				keys: (keys ?? []).map((k) => ({
					id: k.id,
					name: k.name,
					prefix: k.prefix,
					status: k.status,
					scopes: k.scopes,
					created_at: k.created_at,
					last_used_at: k.last_used_at,
				})),
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

async function handleGetKey(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const keyId = url.pathname.split("/").pop();

	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data, error } = await supabase
			.from("provisioning_keys")
			.select("id, team_id, name, prefix, status, scopes, created_by, created_at, last_used_at, soft_blocked")
			.eq("id", keyId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || "Failed to fetch key");
		}

		if (!data) {
			return json({ ok: false, error: "Key not found" }, 404);
		}

		return json(
			{
				ok: true,
				key: {
					id: data.id,
					team_id: data.team_id,
					name: data.name,
					prefix: data.prefix,
					status: data.status,
					scopes: data.scopes,
					created_by: data.created_by,
					created_at: data.created_at,
					last_used_at: data.last_used_at,
					soft_blocked: data.soft_blocked,
				},
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

async function handleUpdateKey(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const keyId = url.pathname.split("/").pop();

	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const body = await req.json();
		const { name, status, soft_blocked } = body;

		const supabase = getSupabaseAdmin();

		const { data: existing, error: fetchError } = await supabase
			.from("provisioning_keys")
			.select("id")
			.eq("id", keyId)
			.maybeSingle();

		if (fetchError) {
			throw new Error(fetchError.message || "Failed to fetch key");
		}

		if (!existing) {
			return json({ ok: false, error: "Key not found" }, 404);
		}

		const updateObj: Record<string, unknown> = {
			updated_at: new Date().toISOString(),
		};

		if (name !== undefined) {
			updateObj.name = name;
		}

		if (status !== undefined) {
			if (!["active", "disabled", "revoked"].includes(status)) {
				return json({ ok: false, error: "Invalid status" }, 400);
			}
			updateObj.status = status;
		}

		if (soft_blocked !== undefined) {
			updateObj.soft_blocked = Boolean(soft_blocked);
		}

		const { error } = await supabase
			.from("provisioning_keys")
			.update(updateObj)
			.eq("id", keyId);

		if (error) {
			throw new Error(error.message || "Failed to update key");
		}

		return json(
			{
				ok: true,
				message: "Key updated successfully",
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		if (error instanceof SyntaxError) {
			return json({ ok: false, error: "invalid JSON" }, 400);
		}
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

async function handleDeleteKey(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const keyId = url.pathname.split("/").pop();

	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data: existing, error: fetchError } = await supabase
			.from("provisioning_keys")
			.select("id, name")
			.eq("id", keyId)
			.maybeSingle();

		if (fetchError) {
			throw new Error(fetchError.message || "Failed to fetch key");
		}

		if (!existing) {
			return json({ ok: false, error: "Key not found" }, 404);
		}

		const { error } = await supabase
			.from("provisioning_keys")
			.delete()
			.eq("id", keyId);

		if (error) {
			throw new Error(error.message || "Failed to delete key");
		}

		return json(
			{
				ok: true,
				message: `Key "${existing.name}" deleted successfully`,
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

export const provisioningRoutes = new Hono<Env>();

provisioningRoutes.get("/keys", withRuntime(handleListKeys));
// POST /keys is commented out - provisioning keys should be created via the dashboard
provisioningRoutes.get("/keys/:id", withRuntime(handleGetKey));
provisioningRoutes.patch("/keys/:id", withRuntime(handleUpdateKey));
provisioningRoutes.delete("/keys/:id", withRuntime(handleDeleteKey));

// Canonical naming moving forward.
export const managementRoutes = provisioningRoutes;

