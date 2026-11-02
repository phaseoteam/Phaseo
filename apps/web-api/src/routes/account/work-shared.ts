import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";

// Shared helpers for the work tracker's account routes (/api/account/work).
//
// Access: the work tracker is an internal prototype. Every route needs a member of the workspace
// (requireAccountWorkspace, as other account routes) who is also a Phaseo internal admin, the
// same check web-api's internal routes use (public.users.role = 'admin').

export type Body = Record<string, unknown>;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

export function badRequest(c: any, message: string) {
	return json(c, { error: "bad_request", message }, 400);
}

export function notFound(c: any, message = "Not found") {
	return json(c, { error: "not_found", message }, 404);
}

export function unavailable(c: any, error = "work_unavailable") {
	return json(c, { error }, 503);
}

export async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

/** Whether the user is a Phaseo internal admin, and their display name (for timelines and notifications). */
export async function internalAdminProfile(context: AccountWorkspaceContext): Promise<{ admin: boolean; name: string | null }> {
	const row = await context.client.from("users").select("role,display_name").eq("user_id", context.user.id).maybeSingle();
	if (row.error) return { admin: false, name: null };
	const name = typeof row.data?.display_name === "string" ? row.data.display_name.trim() || null : null;
	return { admin: String(row.data?.role ?? "").toLowerCase() === "admin", name };
}

export async function isInternalAdmin(context: AccountWorkspaceContext): Promise<boolean> {
	return (await internalAdminProfile(context)).admin;
}

export type WorkAccess = {
	context: AccountWorkspaceContext;
	/** The person's display name, or their email's local part. */
	actorName: string | null;
};

/** The workspace context for a member who is also an internal admin, or the 403 response. */
export async function workAccess(c: any, workspaceId: unknown): Promise<WorkAccess | { response: Response }> {
	if (c.req.header("sec-fetch-site") === "cross-site") return { response: json(c, { error: "cross_site_request_blocked" }, 403) };
	const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
	if (!id) return { response: badRequest(c, "workspaceId is required") };
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: id });
	if (!context) return { response: json(c, { error: "forbidden" }, 403) };
	const profile = await internalAdminProfile(context);
	if (!profile.admin) return { response: json(c, { error: "forbidden" }, 403) };
	return { context, actorName: profile.name ?? context.user.email?.split("@")[0] ?? null };
}

/** Workspace owners and admins (settings changes). */
export function isWorkspaceOwnerOrAdmin(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(String(context.role).toLowerCase());
}

/** Reads workspaceId from the query (GET) or the JSON body (writes). */
export async function accessFromQuery(c: any) {
	return workAccess(c, c.req.query("workspaceId"));
}

export function pathUuid(c: any, name: string): string | null {
	const value = String(c.req.param(name) ?? "").trim();
	return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function pathNumber(c: any, name = "number"): number | null {
	const value = Number(c.req.param(name));
	return Number.isInteger(value) && value > 0 && value < 2_147_483_647 ? value : null;
}

export function clampLimit(value: unknown, fallback: number, max: number): number {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number > 0 ? Math.min(number, max) : fallback;
}

type TextResult = { ok: true; value: string | null | undefined } | { ok: false; message: string };

/**
 * An optional text field: undefined when absent, null when explicitly cleared (null or ""), or the
 * trimmed text when it is a string within the limit.
 */
export function optionalText(body: Body, field: string, max: number, options: { required?: boolean; nullable?: boolean } = {}): TextResult {
	const value = body[field];
	if (value === undefined) return options.required ? { ok: false, message: `${field} is required` } : { ok: true, value: undefined };
	if (value === null || value === "") {
		if (options.required) return { ok: false, message: `${field} is required` };
		return options.nullable === false ? { ok: false, message: `${field} cannot be empty` } : { ok: true, value: null };
	}
	if (typeof value !== "string") return { ok: false, message: `${field} must be a string` };
	const text = value.trim();
	if (text.length > max) return { ok: false, message: `${field} must be at most ${max} characters` };
	if (!text && options.required) return { ok: false, message: `${field} is required` };
	return { ok: true, value: text || null };
}

export function optionalBoolean(body: Body, field: string): { ok: true; value: boolean | undefined } | { ok: false; message: string } {
	const value = body[field];
	if (value === undefined) return { ok: true, value: undefined };
	if (typeof value !== "boolean") return { ok: false, message: `${field} must be true or false` };
	return { ok: true, value };
}

/** Runs work in the background where the runtime allows it (tests have no execution context). */
export function backgroundRunner(c: any): (promise: Promise<unknown>) => void {
	return (promise) => {
		try {
			c.executionCtx.waitUntil(promise);
		} catch {
			promise.catch(() => undefined);
		}
	};
}

export function isWorkspaceMember(context: AccountWorkspaceContext, userId: string): Promise<boolean> {
	return Promise.all([
		context.client.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", userId).maybeSingle(),
		context.client.from("workspaces").select("owner_user_id").eq("id", context.workspaceId).maybeSingle(),
	]).then(([member, workspace]) => Boolean(member.data) || workspace.data?.owner_user_id === userId);
}

const MAX_MEMBERS = 200;

export type WorkMemberProfile = { userId: string; name: string | null; email: string | null };

/** The workspace's members and owner with display names and emails (one auth lookup per member). */
export async function listWorkMembers(context: AccountWorkspaceContext): Promise<WorkMemberProfile[] | null> {
	const [members, workspace] = await Promise.all([
		context.client.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).limit(MAX_MEMBERS),
		context.client.from("workspaces").select("owner_user_id").eq("id", context.workspaceId).maybeSingle(),
	]);
	if (members.error || workspace.error) return null;
	const ids = [...new Set([
		...(members.data ?? []).map((row: any) => String(row.user_id ?? "")),
		String(workspace.data?.owner_user_id ?? ""),
	].filter(Boolean))].slice(0, MAX_MEMBERS);
	if (!ids.length) return [];
	const profiles = await context.client.from("users").select("user_id,display_name").in("user_id", ids);
	if (profiles.error) return null;
	const names = new Map((profiles.data ?? []).map((row: any) => [String(row.user_id), typeof row.display_name === "string" ? row.display_name.trim() || null : null]));
	// Emails live in auth; one admin lookup per member, as the workspace user pages do.
	const emails = await Promise.all(ids.map((id) => context.client.auth.admin.getUserById(id)
		.then((result) => result.data?.user?.email ?? null)
		.catch(() => null)));
	const list = ids.map((userId, index) => ({ userId, name: names.get(userId) ?? null, email: emails[index] ?? null }));
	list.sort((left, right) => (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? ""));
	return list;
}

/** Runs `task` over `items` with at most `limit` running at once, keeping the order of results. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next;
			next += 1;
			results[index] = await task(items[index]!, index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/** An optional uuid field: undefined when absent, null when cleared, the lowercased id otherwise. */
export function optionalUuid(body: Body, field: string): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
	const value = body[field];
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null || value === "") return { ok: true, value: null };
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) return { ok: false, message: `${field} must be an id or null` };
	return { ok: true, value: value.toLowerCase() };
}
