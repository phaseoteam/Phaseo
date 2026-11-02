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

export async function isInternalAdmin(context: AccountWorkspaceContext): Promise<boolean> {
	const role = await context.client.from("users").select("role").eq("user_id", context.user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin";
}

/** The workspace context for a member who is also an internal admin, or the 403 response. */
export async function workAccess(c: any, workspaceId: unknown): Promise<{ context: AccountWorkspaceContext } | { response: Response }> {
	if (c.req.header("sec-fetch-site") === "cross-site") return { response: json(c, { error: "cross_site_request_blocked" }, 403) };
	const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
	if (!id) return { response: badRequest(c, "workspaceId is required") };
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: id });
	if (!context) return { response: json(c, { error: "forbidden" }, 403) };
	if (!await isInternalAdmin(context)) return { response: json(c, { error: "forbidden" }, 403) };
	return { context };
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
