import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES, parseStoredScopeList } from "@/lib/authz/capabilities";
import {
	isManagementKeyTemplate,
	MANAGEMENT_KEY_TEMPLATES,
} from "@/lib/authz/management-key-templates";
import { json, withRuntime } from "@/routes/utils";
import {
	generateManagementKey,
	hmacSecret,
	normalizeScopeInput,
} from "@/routes/auth.helpers";
import { resolveActiveKeyPepper } from "@/lib/security/keyPepper";
import { enforceWorkspaceKeyLimit } from "./management-helpers";
import {
	isResponse,
	parseOffset,
	parsePathId,
	parsePositiveInt,
	requireJsonBody,
	requireCapability,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

type ManagementKeyRow = Record<string, unknown> & {
	id: string;
	workspace_id: string;
	name?: string | null;
	status?: string | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

function selectColumns(): string {
	return [
		"id",
		"workspace_id",
		"name",
		"prefix",
		"status",
		"scopes",
		"created_by",
		"created_at",
		"updated_at",
		"last_used_at",
		"expires_at",
		"soft_blocked",
		"daily_limit_requests",
		"weekly_limit_requests",
		"monthly_limit_requests",
		"daily_limit_cost_nanos",
		"weekly_limit_cost_nanos",
		"monthly_limit_cost_nanos",
	].join(", ");
}

function parseOptionalExpiry(raw: unknown): string | null | undefined {
	if (raw === undefined) return undefined;
	if (raw === null || String(raw).trim() === "") return null;
	const parsed = new Date(String(raw));
	if (Number.isNaN(parsed.getTime())) throw new Error("expires_at must be a valid ISO-8601 datetime or null");
	return parsed.toISOString();
}

function normalizeLimitPatch(body: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	if (body.dailyRequests !== undefined) patch.daily_limit_requests = body.dailyRequests;
	if (body.weeklyRequests !== undefined) patch.weekly_limit_requests = body.weeklyRequests;
	if (body.monthlyRequests !== undefined) patch.monthly_limit_requests = body.monthlyRequests;
	if (body.dailyCostNanos !== undefined) patch.daily_limit_cost_nanos = body.dailyCostNanos;
	if (body.weeklyCostNanos !== undefined) patch.weekly_limit_cost_nanos = body.weeklyCostNanos;
	if (body.monthlyCostNanos !== undefined) patch.monthly_limit_cost_nanos = body.monthlyCostNanos;
	if (body.softBlocked !== undefined) patch.soft_blocked = body.softBlocked;
	return patch;
}

function resolveManagementKeyScopes(body: Record<string, unknown>) {
	if (body.template !== undefined && body.scopes !== undefined) {
		return {
			ok: false as const,
			message: "Provide either template or scopes, not both",
		};
	}

	if (body.template !== undefined) {
		if (!isManagementKeyTemplate(body.template)) {
			return {
				ok: false as const,
				message: `Unsupported management key template: ${String(body.template)}`,
			};
		}
		const scopes = normalizeScopeInput(MANAGEMENT_KEY_TEMPLATES[body.template].scopes);
		return scopes.ok ? { ...scopes, template: body.template } : scopes;
	}

	const scopes = normalizeScopeInput(body.scopes);
	return scopes.ok ? { ...scopes, template: null } : scopes;
}

function formatManagementKey(row: ManagementKeyRow) {
	return {
		...row,
		scopes: parseStoredScopeList(row.scopes),
	};
}

async function issueManagementKey(args: {
	workspaceId: string;
	name: string;
	scopes: string;
	expiresAt: string | null;
	paused: boolean;
	createdBy: string | null;
}) {
	const pepper = resolveActiveKeyPepper(getBindings());
	if (!pepper) throw new Error("KEY_PEPPER_ACTIVE (or KEY_PEPPER) is not configured");

	await enforceWorkspaceKeyLimit(args.workspaceId);
	const generated = generateManagementKey();
	const hash = await hmacSecret(generated.secret, pepper);
	const { data, error } = await getSupabaseAdmin()
		.from("management_keys")
		.insert({
			workspace_id: args.workspaceId,
			name: args.name,
			kid: generated.kid,
			hash,
			prefix: generated.prefix,
			status: args.paused ? "paused" : "active",
			scopes: args.scopes,
			expires_at: args.expiresAt,
			created_by: args.createdBy,
		})
		.select(selectColumns())
		.maybeSingle();
	if (error) throw new Error(error.message || "Failed to create management key");

	return {
		...formatManagementKey(data as unknown as ManagementKeyRow),
		key: generated.plaintext,
	};
}


async function handleListManagementKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.MANAGEMENT_KEYS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const url = new URL(req.url);
	const offset = parseOffset(url.searchParams.get("offset"));
	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	try {
		const { data, error } = await getSupabaseAdmin()
			.from("management_keys")
			.select(selectColumns())
			.eq("workspace_id", auth.value.workspaceId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (error) throw new Error(error.message || "Failed to list management keys");
		return json({ data: (data ?? []).map((row) => formatManagementKey(row as unknown as ManagementKeyRow)) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleCreateManagementKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.MANAGEMENT_KEYS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const name = String(body.name ?? "").trim();
	if (!name) return json({ error: "bad_request", message: "name is required" }, 400, { "Cache-Control": "no-store" });

	try {
		const scopes = resolveManagementKeyScopes(body);
		if (scopes.ok === false) return json({ error: "bad_request", message: scopes.message }, 400, { "Cache-Control": "no-store" });
		const expiresAt = parseOptionalExpiry(body.expires_at ?? body.expiresAt);
		const data = await issueManagementKey({
			workspaceId: auth.value.workspaceId,
			name,
			scopes: scopes.value,
			expiresAt: expiresAt ?? null,
			paused: body.paused === true,
			createdBy: auth.value.userId ?? null,
		});
		return json({ data }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}


async function findManagementKey(workspaceId: string, id: string): Promise<ManagementKeyRow | null> {
	const { data, error } = await getSupabaseAdmin()
		.from("management_keys")
		.select(selectColumns())
		.eq("workspace_id", workspaceId)
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message || "Failed to fetch management key");
	return (data as unknown as ManagementKeyRow | null) ?? null;
}

async function handleGetManagementKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.MANAGEMENT_KEYS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;
	const id = parsePathId(new URL(req.url), "management-keys");
	if (!id) return json({ error: "bad_request", message: "Management key id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const key = await findManagementKey(auth.value.workspaceId, id);
		if (!key) return json({ error: "not_found", message: "Management key not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatManagementKey(key) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleUpdateManagementKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.MANAGEMENT_KEYS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;
	const id = parsePathId(new URL(req.url), "management-keys");
	if (!id) return json({ error: "bad_request", message: "Management key id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;

	try {
		const patch: Record<string, unknown> = normalizeLimitPatch(body);
		if (typeof body.name === "string") patch.name = body.name.trim();
		if (typeof body.paused === "boolean") patch.status = body.paused ? "paused" : "active";
		if (body.scopes !== undefined || body.template !== undefined) {
			if (body.scopes === null) {
				return json(
					{ error: "bad_request", message: "scopes must be omitted to keep existing scopes or provided as a string or string[]" },
					400,
					{ "Cache-Control": "no-store" },
				);
			}
			const scopes = resolveManagementKeyScopes(body);
			if (scopes.ok === false) return json({ error: "bad_request", message: scopes.message }, 400, { "Cache-Control": "no-store" });
			patch.scopes = scopes.value;
		}
		if (typeof body.expires_at !== "undefined" || typeof body.expiresAt !== "undefined") {
			patch.expires_at = parseOptionalExpiry(body.expires_at ?? body.expiresAt);
		}
		if (Object.keys(patch).length === 0) {
			return json({ error: "bad_request", message: "No supported management key fields were provided" }, 400, { "Cache-Control": "no-store" });
		}
		const { data, error } = await getSupabaseAdmin()
			.from("management_keys")
			.update(patch)
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", id)
			.select(selectColumns())
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to update management key");
		if (!data) return json({ error: "not_found", message: "Management key not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatManagementKey(data as unknown as ManagementKeyRow) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleDeleteManagementKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.MANAGEMENT_KEYS_DELETE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;
	const id = parsePathId(new URL(req.url), "management-keys");
	if (!id) return json({ error: "bad_request", message: "Management key id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const { data, error } = await getSupabaseAdmin()
			.from("management_keys")
			.delete()
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", id)
			.select("id")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to delete management key");
		if (!data) return json({ error: "not_found", message: "Management key not found" }, 404, { "Cache-Control": "no-store" });
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

export const managementKeysRoutes = new Hono<Env>();

managementKeysRoutes.get("/", withRuntime(handleListManagementKeys));
managementKeysRoutes.post("/", withRuntime(handleCreateManagementKey));
managementKeysRoutes.get("/:id", withRuntime(handleGetManagementKey));
managementKeysRoutes.patch("/:id", withRuntime(handleUpdateManagementKey));
managementKeysRoutes.delete("/:id", withRuntime(handleDeleteManagementKey));
