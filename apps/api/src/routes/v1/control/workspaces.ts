// Purpose: Workspace control-plane routes.
// Why: Exposes elevated workspace lifecycle operations behind management-key auth.
// How: Resolves the current workspace owner from the management key and scopes CRUD to that owner.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { ensureWorkspaceWalletProvisioned, userHasPaidWorkspaceAccess } from "./management-helpers";

type WorkspaceRow = {
	id: string;
	name: string | null;
	slug: string | null;
	owner_user_id: string | null;
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
	if (!candidate || candidate === "workspaces") return null;
	return decodeURIComponent(candidate).trim() || null;
}

function isValidSlug(slug: string): boolean {
	return /^[a-z0-9-]{1,50}$/.test(slug);
}

function makeSlug(name: string): string {
	const base = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 42);
	const suffix = Date.now().toString(36).slice(-6);
	return `${base || "workspace"}-${suffix}`.slice(0, 50);
}

function formatWorkspace(row: WorkspaceRow) {
	return {
		id: row.id,
		name: row.name ?? null,
		slug: row.slug ?? null,
		created_by: row.owner_user_id ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

async function resolveOwnerUserId(authWorkspaceId: string): Promise<string> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("owner_user_id")
		.eq("id", authWorkspaceId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to resolve workspace owner");
	}
	const ownerUserId = String((data as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
	if (!ownerUserId) {
		throw new Error("Workspace owner not found");
	}
	return ownerUserId;
}

async function isDefaultWorkspaceForUser(userId: string, workspaceId: string): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("users")
		.select("default_workspace_id")
		.eq("user_id", userId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to resolve default workspace");
	}
	return String((data as { default_workspace_id?: unknown } | null)?.default_workspace_id ?? "").trim() === workspaceId;
}

async function findWorkspaceForOwner(ownerUserId: string, identifier: string): Promise<WorkspaceRow | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("id, name, slug, owner_user_id, created_at, updated_at")
		.eq("owner_user_id", ownerUserId)
		.or(`id.eq.${identifier},slug.eq.${identifier}`)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to fetch workspace");
	}
	return (data as WorkspaceRow | null) ?? null;
}

async function handleListWorkspaces(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const url = new URL(req.url);
		const offset = parseOffset(url.searchParams.get("offset"));
		const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
		const supabase = getSupabaseAdmin();

		const { data, error } = await supabase
			.from("workspaces")
			.select("id, name, slug, owner_user_id, created_at, updated_at")
			.eq("owner_user_id", ownerUserId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (error) {
			throw new Error(error.message || "Failed to list workspaces");
		}

		const { count, error: countError } = await supabase
			.from("workspaces")
			.select("id", { count: "exact", head: true })
			.eq("owner_user_id", ownerUserId);
		if (countError) {
			throw new Error(countError.message || "Failed to count workspaces");
		}

		return json(
			{
				data: (data ?? []).map((row) => formatWorkspace(row as WorkspaceRow)),
				total_count: count ?? 0,
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.includes("Stripe customer provisioning is not configured")) {
			return json(
				{ error: "stripe_not_configured", message },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
		return json({ error: "failed", message }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleGetWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const workspace = await findWorkspaceForOwner(ownerUserId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		return json({ data: formatWorkspace(workspace) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleCreateWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const name = String(body.name ?? "").trim();
	if (!name || name.length > 100) {
		return json({ error: "bad_request", message: "name is required and must be 1-100 characters" }, 400, { "Cache-Control": "no-store" });
	}
	const requestedSlug = String(body.slug ?? "").trim().toLowerCase();
	const slug = requestedSlug || makeSlug(name);
	if (!isValidSlug(slug)) {
		return json({ error: "bad_request", message: "slug must match ^[a-z0-9-]+$ and be 1-50 characters" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const hasPaidWorkspaceAccess = await userHasPaidWorkspaceAccess(ownerUserId);
		if (!hasPaidWorkspaceAccess) {
			return json(
				{
					error: "workspace_upgrade_required",
					message: "Additional workspaces unlock after your first credit deposit. Free accounts can use the personal workspace only.",
				},
				403,
				{ "Cache-Control": "no-store" },
			);
		}
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("workspaces")
			.insert({
				name,
				slug,
				owner_user_id: ownerUserId,
			})
			.select("id, name, slug, owner_user_id, created_at, updated_at")
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to create workspace");
		}
		const workspaceId = String((data as WorkspaceRow | null)?.id ?? "").trim();
		if (!workspaceId) {
			throw new Error("Workspace creation returned no id");
		}

		await supabase
			.from("workspace_members")
			.upsert(
				{ workspace_id: workspaceId, user_id: ownerUserId, role: "owner" },
				{ onConflict: "workspace_id,user_id", ignoreDuplicates: true },
			);
		await ensureWorkspaceWalletProvisioned({
			workspaceId,
			userId: ownerUserId,
		});
		await supabase
			.from("workspace_settings")
			.upsert({ workspace_id: workspaceId, routing_mode: "balanced" }, { onConflict: "workspace_id", ignoreDuplicates: false });

		return json({ data: formatWorkspace(data as WorkspaceRow) }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.includes("Stripe customer provisioning is not configured")) {
			return json(
				{ error: "stripe_not_configured", message },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
		return json({ error: "failed", message }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleUpdateWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const updatePayload: Record<string, unknown> = {};
	if (typeof body.name === "string") {
		const name = body.name.trim();
		if (!name || name.length > 100) {
			return json({ error: "bad_request", message: "name must be 1-100 characters" }, 400, { "Cache-Control": "no-store" });
		}
		updatePayload.name = name;
	}
	if (typeof body.slug === "string") {
		const slug = body.slug.trim().toLowerCase();
		if (!isValidSlug(slug)) {
			return json({ error: "bad_request", message: "slug must match ^[a-z0-9-]+$ and be 1-50 characters" }, 400, { "Cache-Control": "no-store" });
		}
		updatePayload.slug = slug;
	}
	if (Object.keys(updatePayload).length === 0) {
		return json({ error: "bad_request", message: "No supported workspace fields were provided" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const existing = await findWorkspaceForOwner(ownerUserId, identifier);
		if (!existing) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		if (await isDefaultWorkspaceForUser(ownerUserId, existing.id)) {
			return json(
				{ error: "bad_request", message: "Personal workspace cannot be renamed." },
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const supabase = getSupabaseAdmin();
		const { error } = await supabase
			.from("workspaces")
			.update(updatePayload)
			.eq("id", existing.id)
			.eq("owner_user_id", ownerUserId);
		if (error) {
			throw new Error(error.message || "Failed to update workspace");
		}

		const updated = await findWorkspaceForOwner(ownerUserId, existing.id);
		if (!updated) {
			throw new Error("Workspace update succeeded but refetch failed");
		}

		return json({ data: formatWorkspace(updated) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleDeleteWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const workspace = await findWorkspaceForOwner(ownerUserId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}

		const supabase = getSupabaseAdmin();
		const { data: userRow, error: userError } = await supabase
			.from("users")
			.select("default_workspace_id")
			.eq("user_id", ownerUserId)
			.maybeSingle();
		if (userError) {
			throw new Error(userError.message || "Failed to resolve default workspace");
		}
		if (String((userRow as { default_workspace_id?: unknown } | null)?.default_workspace_id ?? "").trim() === workspace.id) {
			return json({ error: "bad_request", message: "The default workspace cannot be deleted" }, 400, { "Cache-Control": "no-store" });
		}

		const { count: activeKeyCount, error: keyCountError } = await supabase
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspace.id)
			.neq("status", "deleted");
		if (keyCountError) {
			throw new Error(keyCountError.message || "Failed to count workspace keys");
		}
		if ((activeKeyCount ?? 0) > 0) {
			return json({ error: "bad_request", message: "Workspaces with active API keys cannot be deleted" }, 400, { "Cache-Control": "no-store" });
		}

		await supabase.from("workspace_members").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_invites").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_join_requests").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_settings").delete().eq("workspace_id", workspace.id);
		await supabase.from("wallets").delete().eq("workspace_id", workspace.id);
		await supabase.from("management_keys").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspaces").delete().eq("id", workspace.id).eq("owner_user_id", ownerUserId);

		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return json({ error: "failed", message: String(error?.message ?? error) }, 500, { "Cache-Control": "no-store" });
	}
}

export const workspacesRoutes = new Hono<Env>();

workspacesRoutes.get("/", withRuntime(handleListWorkspaces));
workspacesRoutes.post("/", withRuntime(handleCreateWorkspace));
workspacesRoutes.get("/:id", withRuntime(handleGetWorkspace));
workspacesRoutes.patch("/:id", withRuntime(handleUpdateWorkspace));
workspacesRoutes.delete("/:id", withRuntime(handleDeleteWorkspace));
