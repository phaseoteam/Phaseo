// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { decodeJWT } from "@/lib/oauth/jwt";
import { json, withRuntime } from "@/routes/utils";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const KEY_PREFIX = "aistats_v1_sk_";

const encoder = new TextEncoder();

function randomBase62(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += BASE62[bytes[i] % BASE62.length];
	}
	return out;
}

function generateManagementKey() {
	const kid = randomBase62(12);
	const secret = randomBase62(40);
	const plaintext = `${KEY_PREFIX}${kid}_${secret}`;
	const prefix = kid.slice(0, 6);
	return { kid, secret, plaintext, prefix };
}

async function hmacSecret(secret: string, pepper: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(pepper),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(secret));
	const bytes = new Uint8Array(signature);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

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

function parsePathKeyId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const candidate = segments.at(-1);
	if (!candidate || candidate === "keys" || candidate === "key") {
		return null;
	}
	return candidate;
}

function parseQueryKeyId(url: URL): string | null {
	const id = url.searchParams.get("id")?.trim();
	return id ? id : null;
}

function normalizeScopesInput(scopes: unknown): { ok: true; value: string } | { ok: false; message: string } {
	if (scopes === undefined || scopes === null) {
		return { ok: true, value: "[]" };
	}
	if (typeof scopes === "string") {
		const trimmed = scopes.trim();
		return { ok: true, value: trimmed.length ? trimmed : "[]" };
	}
	if (Array.isArray(scopes)) {
		const normalized = scopes.map((entry) => String(entry));
		return { ok: true, value: JSON.stringify(normalized) };
	}
	return { ok: false, message: "scopes must be a string or string array" };
}

function extractUserIdFromBearer(req: Request): string | null {
	const authHeader = req.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) return null;
	const token = authHeader.slice(7).trim();
	const decoded = decodeJWT(token);
	const userId = decoded?.payload?.user_id;
	return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

async function resolveCreatorUserId(args: {
	req: Request;
	teamId: string;
	internal?: boolean;
	bodyCreatorUserId: unknown;
}): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
	const userIdFromToken = extractUserIdFromBearer(args.req);
	if (userIdFromToken) {
		if (
			typeof args.bodyCreatorUserId === "string" &&
			args.bodyCreatorUserId.trim().length > 0 &&
			args.bodyCreatorUserId.trim() !== userIdFromToken
		) {
			return {
				ok: false,
				response: json(
					{
						ok: false,
						error: "forbidden",
						message: "created_by must match the authenticated user",
					},
					403,
					{ "Cache-Control": "no-store" }
				),
			};
		}
		return { ok: true, userId: userIdFromToken };
	}

	if (args.internal && typeof args.bodyCreatorUserId === "string" && args.bodyCreatorUserId.trim().length > 0) {
		return { ok: true, userId: args.bodyCreatorUserId.trim() };
	}

	try {
		const supabase = getSupabaseAdmin();
		const { data: team, error } = await supabase
			.from("teams")
			.select("owner_user_id")
			.eq("id", args.teamId)
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to resolve team owner");
		}
		if (team?.owner_user_id && typeof team.owner_user_id === "string") {
			return { ok: true, userId: team.owner_user_id };
		}
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "creator_user_id_required",
					message: "creator_user_id is required when no user-scoped bearer token is provided",
				},
				400,
				{ "Cache-Control": "no-store" }
			),
		};
	} catch (error: any) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "failed",
					message: String(error?.message ?? error),
				},
				500,
				{ "Cache-Control": "no-store" }
			),
		};
	}
}

function resolveScopedTeamId(args: {
	authTeamId: string;
	requestedTeamId: string | null;
	internal?: boolean;
}): { ok: true; teamId: string } | { ok: false; response: Response } {
	const requested = args.requestedTeamId?.trim();
	if (!requested) {
		return { ok: true, teamId: args.authTeamId };
	}
	if (!args.internal && requested !== args.authTeamId) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "forbidden",
					message: "team_id must match authenticated team",
				},
				403,
				{ "Cache-Control": "no-store" }
			),
		};
	}
	return { ok: true, teamId: requested };
}

async function handleListKeys(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.teamId,
		requestedTeamId: url.searchParams.get("team_id"),
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const teamId = teamScope.teamId;
	const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = parseOffsetParam(url.searchParams.get("offset"));

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

async function handleCreateKey(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ ok: false, error: "invalid_json", message: "Invalid JSON body" }, 400, {
				"Cache-Control": "no-store",
			});
		}
		throw error;
	}

	const nameRaw = body.name;
	if (typeof nameRaw !== "string" || nameRaw.trim().length === 0) {
		return json({ ok: false, error: "validation_error", message: "name is required" }, 400, {
			"Cache-Control": "no-store",
		});
	}
	const name = nameRaw.trim();
	if (name.length > 100) {
		return json({ ok: false, error: "validation_error", message: "name must be 100 characters or fewer" }, 400, {
			"Cache-Control": "no-store",
		});
	}

	const requestedStatus = body.status;
	const status = typeof requestedStatus === "string" ? requestedStatus : "active";
	if (!["active", "disabled", "revoked"].includes(status)) {
		return json({ ok: false, error: "validation_error", message: "status must be active, disabled, or revoked" }, 400, {
			"Cache-Control": "no-store",
		});
	}

	const scopesInput = normalizeScopesInput(body.scopes);
	if (scopesInput.ok === false) {
		return json({ ok: false, error: "validation_error", message: scopesInput.message }, 400, {
			"Cache-Control": "no-store",
		});
	}

	const url = new URL(req.url);
	const requestedTeamId =
		typeof body.team_id === "string"
			? body.team_id
			: url.searchParams.get("team_id");
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.teamId,
		requestedTeamId,
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const teamId = teamScope.teamId;

	const creator = await resolveCreatorUserId({
		req,
		teamId,
		internal: auth.value.internal,
		bodyCreatorUserId: body.created_by,
	});
	if (creator.ok === false) {
		return creator.response;
	}

	const pepper = (getBindings().KEY_PEPPER ?? "").trim();
	if (!pepper) {
		return json(
			{
				ok: false,
				error: "server_misconfig_missing_pepper",
				message: "KEY_PEPPER is not configured",
			},
			503,
			{ "Cache-Control": "no-store" }
		);
	}

	try {
		const supabase = getSupabaseAdmin();
		const softBlocked = body.soft_blocked === undefined ? false : Boolean(body.soft_blocked);
		const nowIso = new Date().toISOString();

		for (let attempt = 0; attempt < 3; attempt++) {
			const generated = generateManagementKey();
			const hash = await hmacSecret(generated.secret, pepper);
			const insertObj = {
				team_id: teamId,
				name,
				kid: generated.kid,
				hash,
				prefix: generated.prefix,
				status,
				scopes: scopesInput.value,
				created_by: creator.userId,
				soft_blocked: softBlocked,
				created_at: nowIso,
			};

			const { data, error } = await supabase
				.from("provisioning_keys")
				.insert(insertObj)
				.select("id, name, prefix, status, scopes, created_at")
				.maybeSingle();

			if (!error && data) {
				return json(
					{
						ok: true,
						key: {
							id: data.id,
							name: data.name,
							prefix: data.prefix,
							status: data.status,
							scopes: data.scopes,
							created_at: data.created_at,
							key: generated.plaintext,
						},
					},
					201,
					{ "Cache-Control": "no-store" }
				);
			}

			const errorCode = (error as { code?: string } | null)?.code;
			if (errorCode === "23505" && attempt < 2) {
				continue;
			}
			throw new Error(error?.message || "Failed to create key");
		}

		throw new Error("Failed to generate unique key");
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
	const keyId = parsePathKeyId(url);

	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data, error } = await supabase
			.from("provisioning_keys")
			.select("id, team_id, name, prefix, status, scopes, created_by, created_at, last_used_at, soft_blocked")
			.eq("id", keyId)
			.eq("team_id", auth.value.teamId)
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

async function handleGetKeyAlias(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const keyId = parseQueryKeyId(url);
	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data, error } = await supabase
			.from("provisioning_keys")
			.select("id, team_id, name, prefix, status, scopes, created_by, created_at, last_used_at, soft_blocked")
			.eq("id", keyId)
			.eq("team_id", auth.value.teamId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || "Failed to fetch key");
		}

		if (!data) {
			return json({ ok: false, error: "Key not found" }, 404, { "Cache-Control": "no-store" });
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
	const keyId = parsePathKeyId(url);

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
			.eq("team_id", auth.value.teamId)
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
			.eq("id", keyId)
			.eq("team_id", auth.value.teamId);

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
	const keyId = parsePathKeyId(url);

	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();

		const { data: existing, error: fetchError } = await supabase
			.from("provisioning_keys")
			.select("id, name")
			.eq("id", keyId)
			.eq("team_id", auth.value.teamId)
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
			.eq("id", keyId)
			.eq("team_id", auth.value.teamId);

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
provisioningRoutes.post("/keys", withRuntime(handleCreateKey));
provisioningRoutes.get("/keys/:id", withRuntime(handleGetKey));
provisioningRoutes.patch("/keys/:id", withRuntime(handleUpdateKey));
provisioningRoutes.delete("/keys/:id", withRuntime(handleDeleteKey));

// Canonical naming moving forward.
export const managementRoutes = provisioningRoutes;

export const keyAliasRoutes = new Hono<Env>();
keyAliasRoutes.get("/keys", withRuntime(handleListKeys));
keyAliasRoutes.post("/keys", withRuntime(handleCreateKey));
keyAliasRoutes.get("/key", withRuntime(handleGetKeyAlias));

