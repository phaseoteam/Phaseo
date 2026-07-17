import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import {
	type ManagementRouteAuth,
	internalServerError,
	requireCapability,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

type PresetRow = {
	id: string;
	workspace_id: string;
	name: string | null;
	slug?: string | null;
	description?: string | null;
	config?: unknown;
	visibility?: string | null;
	created_by?: string | null;
	source_preset_id?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized <= 0) return fallback;
	return Math.min(normalized, max);
}

function parseOffset(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function parsePathId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const candidate = segments.at(-1);
	if (!candidate || candidate === "presets") return null;
	return decodeURIComponent(candidate).trim() || null;
}

function normalizePresetName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";
	return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function validatePresetName(name: string): string | null {
	const normalized = normalizePresetName(name);
	if (!normalized || normalized.length < 2) return "name is required";
	if (normalized.length > 100) return "name must be 100 characters or fewer";
	if (!/^@[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(normalized)) {
		return "name must start with @ and contain only letters, numbers, hyphens, underscores, and periods";
	}
	return null;
}

function normalizeVisibility(value: unknown): "private" | "team" | "public" {
	if (value === "private" || value === "team" || value === "public") return value;
	return "team";
}

function normalizeConfig(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function formatPreset(row: PresetRow) {
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: row.name ?? null,
		slug: row.slug ?? null,
		description: row.description ?? null,
		config: row.config ?? {},
		visibility: row.visibility ?? "team",
		created_by: row.created_by ?? null,
		source_preset_id: row.source_preset_id ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

async function findPreset(workspaceId: string, identifier: string): Promise<PresetRow | null> {
	const supabase = getSupabaseAdmin();
	const select = "id, workspace_id, name, slug, description, config, visibility, created_by, source_preset_id, created_at, updated_at";
	const byId = await supabase
		.from("presets")
		.select(select)
		.eq("workspace_id", workspaceId)
		.eq("id", identifier)
		.maybeSingle();
	if (byId.error) throw new Error(byId.error.message || "Failed to fetch preset");
	if (byId.data) return byId.data as PresetRow;

	const bySlug = await supabase
		.from("presets")
		.select(select)
		.eq("workspace_id", workspaceId)
		.eq("slug", identifier)
		.maybeSingle();
	if (bySlug.error) throw new Error(bySlug.error.message || "Failed to fetch preset");
	if (bySlug.data) return bySlug.data as PresetRow;

	const byName = await supabase
		.from("presets")
		.select(select)
		.eq("workspace_id", workspaceId)
		.eq("name", normalizePresetName(identifier))
		.maybeSingle();
	if (byName.error) throw new Error(byName.error.message || "Failed to fetch preset");
	return (byName.data as PresetRow | null) ?? null;
}

async function handleListPresets(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.PRESETS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const url = new URL(req.url);
	const offset = parseOffset(url.searchParams.get("offset"));
	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const visibility = url.searchParams.get("visibility")?.trim();

	try {
		let query = getSupabaseAdmin()
			.from("presets")
			.select("id, workspace_id, name, slug, description, config, visibility, created_by, source_preset_id, created_at, updated_at")
			.eq("workspace_id", auth.value.workspaceId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (visibility) query = query.eq("visibility", visibility);

		const { data, error } = await query;
		if (error) throw new Error(error.message || "Failed to list presets");
		return json(
			{
				data: (data ?? []).map((row) => formatPreset(row as PresetRow)),
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		return internalServerError("presets.list", error);
	}
}

async function handleCreatePreset(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.PRESETS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const name = normalizePresetName(String(body.name ?? ""));
	const nameError = validatePresetName(name);
	if (nameError) return json({ error: "bad_request", message: nameError }, 400, { "Cache-Control": "no-store" });
	const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
	const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null;

	try {
		const { data: duplicate, error: duplicateError } = await getSupabaseAdmin()
			.from("presets")
			.select("id")
			.eq("workspace_id", auth.value.workspaceId)
			.eq("name", name)
			.maybeSingle();
		if (duplicateError) throw new Error(duplicateError.message || "Failed to check preset name");
		if (duplicate) {
			return json({ error: "conflict", message: `Preset "${name}" already exists in this workspace` }, 409, { "Cache-Control": "no-store" });
		}

		const { data, error } = await getSupabaseAdmin()
			.from("presets")
			.insert({
				workspace_id: auth.value.workspaceId,
				name,
				slug,
				description,
				config: normalizeConfig(body.config),
				visibility: normalizeVisibility(body.visibility),
				created_by: auth.value.userId ?? null,
			})
			.select("id, workspace_id, name, slug, description, config, visibility, created_by, source_preset_id, created_at, updated_at")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to create preset");
		return json({ data: formatPreset(data as PresetRow) }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("presets.create", error);
	}
}

async function handleGetPreset(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.PRESETS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) return json({ error: "bad_request", message: "Preset id, slug, or name is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const preset = await findPreset(auth.value.workspaceId, identifier);
		if (!preset) return json({ error: "not_found", message: "Preset not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatPreset(preset) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("presets.get", error);
	}
}

async function handleUpdatePreset(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.PRESETS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) return json({ error: "bad_request", message: "Preset id, slug, or name is required" }, 400, { "Cache-Control": "no-store" });

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	try {
		const existing = await findPreset(auth.value.workspaceId, identifier);
		if (!existing) return json({ error: "not_found", message: "Preset not found" }, 404, { "Cache-Control": "no-store" });

		const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (typeof body.name === "string") {
			const name = normalizePresetName(body.name);
			const nameError = validatePresetName(name);
			if (nameError) return json({ error: "bad_request", message: nameError }, 400, { "Cache-Control": "no-store" });
			const { data: duplicate, error: duplicateError } = await getSupabaseAdmin()
				.from("presets")
				.select("id")
				.eq("workspace_id", auth.value.workspaceId)
				.eq("name", name)
				.neq("id", existing.id)
				.maybeSingle();
			if (duplicateError) throw new Error(duplicateError.message || "Failed to check preset name");
			if (duplicate) {
				return json({ error: "conflict", message: `Preset "${name}" already exists in this workspace` }, 409, { "Cache-Control": "no-store" });
			}
			updatePayload.name = name;
		}
		if (typeof body.slug === "string") updatePayload.slug = body.slug.trim() || null;
		if (body.description !== undefined) updatePayload.description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
		if (body.config !== undefined) updatePayload.config = { ...normalizeConfig(existing.config), ...normalizeConfig(body.config) };
		if (body.visibility !== undefined) updatePayload.visibility = normalizeVisibility(body.visibility);

		const { error } = await getSupabaseAdmin()
			.from("presets")
			.update(updatePayload)
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", existing.id);
		if (error) throw new Error(error.message || "Failed to update preset");
		const updated = await findPreset(auth.value.workspaceId, existing.id);
		return json({ data: formatPreset(updated as PresetRow) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("presets.update", error);
	}
}

async function handleDeletePreset(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.PRESETS_DELETE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) return json({ error: "bad_request", message: "Preset id, slug, or name is required" }, 400, { "Cache-Control": "no-store" });

	try {
		const existing = await findPreset(auth.value.workspaceId, identifier);
		if (!existing) return json({ error: "not_found", message: "Preset not found" }, 404, { "Cache-Control": "no-store" });
		const { error } = await getSupabaseAdmin()
			.from("presets")
			.delete()
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", existing.id);
		if (error) throw new Error(error.message || "Failed to delete preset");
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("presets.delete", error);
	}
}

export const presetsRoutes = new Hono<Env>();

presetsRoutes.get("/", withRuntime(handleListPresets));
presetsRoutes.post("/", withRuntime(handleCreatePreset));
presetsRoutes.get("/:id", withRuntime(handleGetPreset));
presetsRoutes.patch("/:id", withRuntime(handleUpdatePreset));
presetsRoutes.delete("/:id", withRuntime(handleDeletePreset));
