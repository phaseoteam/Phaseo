import { Hono } from "hono";
import type { Env } from "@/env";
import { encryptGithubToken } from "@/work/github";
import { buildGithubWorkflow, type WorkflowHarness } from "@/work/githubWorkflow";
import {
	addWorkItemEvent,
	createWorkItem,
	formatErrorGroup,
	formatErrorProject,
	formatGithubRepo,
	formatIntakeForm,
	formatWorkItem,
	isClosedState,
	isGithubRepo,
	loadWorkItemById,
	updateWorkItem,
} from "@/work/items";
import {
	ERROR_RULE_COLUMNS,
	formatErrorRelease,
	formatErrorRule,
	formatSourcemap,
	mapGroupFrames,
	MAX_RULES_PER_PROJECT,
	parseRuleInput,
	SOURCEMAP_COLUMNS,
	type ErrorRuleRow,
	type SourcemapRow,
} from "@/work/errorTools";
import { newWorkToken } from "@/work/tokens";
import { stripPersonalData } from "@/work/triage";
import { ERROR_GROUP_STATUSES, type ErrorGroupRow, type ErrorProjectRow, type GithubRepoRow, type IntakeFormRow, type WorkItemRow } from "@/work/types";
import {
	accessFromQuery,
	badRequest,
	clampLimit,
	json,
	notFound,
	optionalBoolean,
	optionalText,
	pathUuid,
	readBody,
	unavailable,
	UUID_PATTERN,
	workAccess,
} from "./work-shared";

// Work tracker settings and errors: intake forms, error projects, error groups and linked GitHub
// repositories. Tokens and keys are returned once, on creation; only their SHA-256 hashes and
// display prefixes are stored. A repository's GitHub token is stored encrypted and never returned.

const INTAKE_FORM_COLUMNS = "id,workspace_id,name,token_prefix,enabled,auto_triage,created_by,created_at,last_used_at";
const ERROR_PROJECT_COLUMNS = "id,workspace_id,name,key_prefix,enabled,auto_triage,github_repo,created_by,created_at,last_event_at,upload_key_prefix";
const GITHUB_REPO_COLUMNS = "id,workspace_id,repo,bridge_token_prefix,github_token_ciphertext,sync_issues,created_by,created_at,last_event_at";
const ERROR_GROUP_SELECT = "*,project:work_error_projects(name),item:work_items(number)";
const MAX_GITHUB_TOKEN_CHARS = 500;

export const accountWorkSettingsRouter = new Hono<{ Bindings: Env }>();

function writeError(c: any, error: { code?: string } | null, conflictMessage = "This already exists") {
	if (error?.code === "23505") return json(c, { error: "conflict", message: conflictMessage }, 409);
	if (error?.code === "23514") return badRequest(c, "The values are not valid");
	return unavailable(c, "work_settings_write_failed");
}

function parseHarness(value: unknown): WorkflowHarness | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	return value === "claude-code" || value === "codex" ? value : null;
}

function parseModel(value: unknown): string | undefined | null {
	if (value === undefined || value === null || value === "") return undefined;
	return typeof value === "string" && /^[A-Za-z0-9._:/-]{1,120}$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------------------------
// Intake forms
// ---------------------------------------------------------------------------------------------

accountWorkSettingsRouter.get("/intake-forms", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_intake_forms").select(INTAKE_FORM_COLUMNS)
		.eq("workspace_id", context.workspaceId).order("created_at", { ascending: true }).limit(100);
	if (error) return unavailable(c);
	return json(c, { forms: (data ?? []).map((row: any) => formatIntakeForm(row as IntakeFormRow)) });
});

accountWorkSettingsRouter.post("/intake-forms", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const name = optionalText(body, "name", 100, { required: true });
	if (name.ok === false) return badRequest(c, name.message);
	const autoTriage = optionalBoolean(body, "autoTriage");
	if (autoTriage.ok === false) return badRequest(c, autoTriage.message);
	const token = await newWorkToken("form");
	const { data, error } = await context.client.from("work_intake_forms").insert({
		workspace_id: context.workspaceId,
		name: name.value,
		token_hash: token.hash,
		token_prefix: token.prefix,
		auto_triage: autoTriage.value ?? true,
		created_by: context.user.id,
	}).select(INTAKE_FORM_COLUMNS).maybeSingle();
	if (error || !data) return writeError(c, error);
	return json(c, { form: formatIntakeForm(data as unknown as IntakeFormRow), token: token.token }, 201);
});

accountWorkSettingsRouter.patch("/intake-forms/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An intake form id is required");
	const patch: Record<string, unknown> = {};
	const name = optionalText(body, "name", 100, { nullable: false });
	if (name.ok === false) return badRequest(c, name.message);
	if (name.value) patch.name = name.value;
	for (const [field, column] of [["enabled", "enabled"], ["autoTriage", "auto_triage"]] as const) {
		const value = optionalBoolean(body, field);
		if (value.ok === false) return badRequest(c, value.message);
		if (value.value !== undefined) patch[column] = value.value;
	}
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_intake_forms").update(patch)
		.eq("workspace_id", context.workspaceId).eq("id", id).select(INTAKE_FORM_COLUMNS).maybeSingle();
	if (error) return writeError(c, error);
	if (!data) return notFound(c, "Intake form not found");
	return json(c, { form: formatIntakeForm(data as unknown as IntakeFormRow) });
});

accountWorkSettingsRouter.delete("/intake-forms/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An intake form id is required");
	const { data, error } = await context.client.from("work_intake_forms").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Intake form not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Error projects
// ---------------------------------------------------------------------------------------------

accountWorkSettingsRouter.get("/error-projects", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_error_projects").select(ERROR_PROJECT_COLUMNS)
		.eq("workspace_id", context.workspaceId).order("created_at", { ascending: true }).limit(100);
	if (error) return unavailable(c);
	return json(c, { projects: (data ?? []).map((row: any) => formatErrorProject(row as ErrorProjectRow)) });
});

function parseRepoField(value: unknown): { ok: true; value: string | null | undefined } | { ok: false } {
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null || value === "") return { ok: true, value: null };
	return isGithubRepo(value) ? { ok: true, value } : { ok: false };
}

accountWorkSettingsRouter.post("/error-projects", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const name = optionalText(body, "name", 100, { required: true });
	if (name.ok === false) return badRequest(c, name.message);
	const autoTriage = optionalBoolean(body, "autoTriage");
	if (autoTriage.ok === false) return badRequest(c, autoTriage.message);
	const repo = parseRepoField(body.githubRepo);
	if (!repo.ok) return badRequest(c, "githubRepo must look like owner/name");
	const key = await newWorkToken("errors");
	const { data, error } = await context.client.from("work_error_projects").insert({
		workspace_id: context.workspaceId,
		name: name.value,
		key_hash: key.hash,
		key_prefix: key.prefix,
		auto_triage: autoTriage.value ?? true,
		github_repo: repo.value ?? null,
		created_by: context.user.id,
	}).select(ERROR_PROJECT_COLUMNS).maybeSingle();
	if (error || !data) return writeError(c, error);
	return json(c, { project: formatErrorProject(data as unknown as ErrorProjectRow), key: key.token }, 201);
});

accountWorkSettingsRouter.patch("/error-projects/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An error project id is required");
	const patch: Record<string, unknown> = {};
	const name = optionalText(body, "name", 100, { nullable: false });
	if (name.ok === false) return badRequest(c, name.message);
	if (name.value) patch.name = name.value;
	for (const [field, column] of [["enabled", "enabled"], ["autoTriage", "auto_triage"]] as const) {
		const value = optionalBoolean(body, field);
		if (value.ok === false) return badRequest(c, value.message);
		if (value.value !== undefined) patch[column] = value.value;
	}
	const repo = parseRepoField(body.githubRepo);
	if (!repo.ok) return badRequest(c, "githubRepo must look like owner/name");
	if (repo.value !== undefined) patch.github_repo = repo.value;
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_error_projects").update(patch)
		.eq("workspace_id", context.workspaceId).eq("id", id).select(ERROR_PROJECT_COLUMNS).maybeSingle();
	if (error) return writeError(c, error);
	if (!data) return notFound(c, "Error project not found");
	return json(c, { project: formatErrorProject(data as unknown as ErrorProjectRow) });
});

accountWorkSettingsRouter.delete("/error-projects/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An error project id is required");
	const { data, error } = await context.client.from("work_error_projects").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Error project not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Error groups
// ---------------------------------------------------------------------------------------------

accountWorkSettingsRouter.get("/errors", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	let query = context.client.from("work_error_groups").select(ERROR_GROUP_SELECT).eq("workspace_id", context.workspaceId);
	const status = c.req.query("status")?.trim();
	if (status) {
		if (!(ERROR_GROUP_STATUSES as readonly string[]).includes(status)) return badRequest(c, "status must be open, resolved or ignored");
		query = query.eq("status", status);
	}
	const projectId = c.req.query("projectId")?.trim();
	if (projectId) {
		if (!UUID_PATTERN.test(projectId)) return badRequest(c, "projectId is not valid");
		query = query.eq("project_id", projectId.toLowerCase());
	}
	const limit = clampLimit(c.req.query("limit"), 100, 200);
	const { data, error } = await query.order("last_seen_at", { ascending: false }).limit(limit);
	if (error) return unavailable(c);
	return json(c, { groups: (data ?? []).map((row: any) => formatErrorGroup(row)) });
});

async function loadGroup(c: any, context: { client: any; workspaceId: string }) {
	const id = pathUuid(c, "id");
	if (!id) return { response: badRequest(c, "An error group id is required") } as const;
	const { data, error } = await context.client.from("work_error_groups").select(ERROR_GROUP_SELECT).eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) return { response: unavailable(c) } as const;
	if (!data) return { response: notFound(c, "Error group not found") } as const;
	return { group: data as ErrorGroupRow & { project: { name: string } | null; item: { number: number } | null } } as const;
}

accountWorkSettingsRouter.get("/errors/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const loaded = await loadGroup(c, access.context);
	if ("response" in loaded) return loaded.response;
	const { group } = loaded;
	let mappedFrames = null;
	try {
		mappedFrames = await mapGroupFrames({ client: access.context.client, bucket: c.env.WORK_SOURCEMAPS, projectId: group.project_id, release: group.last_release, lastEvent: group.last_event ?? {} });
	} catch (error) {
		console.error("[work] source map lookup failed", { groupId: group.id, message: error instanceof Error ? error.message : String(error) });
	}
	return json(c, { group: formatErrorGroup(group), mappedFrames });
});

accountWorkSettingsRouter.patch("/errors/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (!(ERROR_GROUP_STATUSES as readonly unknown[]).includes(body.status)) return badRequest(c, "status must be open, resolved or ignored");
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An error group id is required");
	const loaded = await loadGroup(c, context);
	if ("response" in loaded) return loaded.response;
	const { data, error } = await context.client.from("work_error_groups").update({
		status: body.status,
		resolved_at: body.status === "resolved" ? new Date().toISOString() : null,
		...(body.status === "resolved" ? { resolved_in_release: loaded.group.last_release ?? null } : {}),
	}).eq("workspace_id", context.workspaceId).eq("id", id).select(ERROR_GROUP_SELECT).maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Error group not found");
	return json(c, { group: formatErrorGroup(data as any) });
});

/** A work item title for an error group: "Type: message", without contact details. */
export function errorItemTitle(group: Pick<ErrorGroupRow, "exception_type" | "message">): string {
	const message = stripPersonalData((group.message ?? "").replace(/\s+/g, " ").trim());
	const title = message ? `${group.exception_type}: ${message}` : group.exception_type;
	return (title.length > 200 ? `${title.slice(0, 197)}...` : title) || "Error";
}

/** Creates the group's work item, or returns (and reopens, when closed) the one it already has. */
accountWorkSettingsRouter.post("/errors/:id/item", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const loaded = await loadGroup(c, context);
	if ("response" in loaded) return loaded.response;
	const { group } = loaded;
	const actor = { kind: "user" as const, userId: context.user.id };
	try {
		if (group.work_item_id) {
			const existing = await loadWorkItemById(context.client, context.workspaceId, group.work_item_id);
			if (existing) {
				const item = isClosedState(existing.state) ? await updateWorkItem(context.client, existing, { state: "todo" }, actor) : existing;
				if (item !== existing) {
					await addWorkItemEvent(context.client, {
						workspaceId: context.workspaceId, workItemId: item.id, kind: "error", authorKind: "user", authorUserId: context.user.id,
						body: "Reopened from the error group", data: { errorGroupId: group.id, eventCount: Number(group.event_count) || 0 },
					}).catch(() => undefined);
				}
				return json(c, { item: formatWorkItem(item), created: false });
			}
		}
		const project = await context.client.from("work_error_projects").select("github_repo").eq("workspace_id", context.workspaceId).eq("id", group.project_id).maybeSingle();
		const description = [
			`${group.exception_type}: ${group.message ?? ""}`.trim(),
			group.culprit ? `Culprit: ${group.culprit}` : null,
			`Seen ${Number(group.event_count) || 0} time(s), first ${group.first_seen_at}, last ${group.last_seen_at}.`,
		].filter(Boolean).join("\n\n");
		const item: WorkItemRow = await createWorkItem(context.client, {
			workspaceId: context.workspaceId,
			title: errorItemTitle(group),
			description,
			source: "error",
			createdBy: context.user.id,
			authorKind: "user",
			errorGroupId: group.id,
			githubRepo: (project.data?.github_repo as string | null | undefined) ?? null,
		});
		const linked = await context.client.from("work_error_groups").update({ work_item_id: item.id }).eq("workspace_id", context.workspaceId).eq("id", group.id);
		if (linked.error) console.error("[work] error group not linked", { groupId: group.id });
		return json(c, { item: formatWorkItem(item), created: true }, 201);
	} catch {
		return unavailable(c, "work_item_create_failed");
	}
});

// ---------------------------------------------------------------------------------------------
// GitHub repositories
// ---------------------------------------------------------------------------------------------

accountWorkSettingsRouter.get("/github-repos", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_github_repos").select(GITHUB_REPO_COLUMNS)
		.eq("workspace_id", context.workspaceId).order("repo", { ascending: true }).limit(100);
	if (error) return unavailable(c);
	return json(c, { repos: (data ?? []).map((row: any) => formatGithubRepo(row as GithubRepoRow)) });
});

async function encryptedToken(c: any, value: unknown): Promise<{ ok: true; value: string | null | undefined } | { ok: false; response: Response }> {
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null || value === "") return { ok: true, value: null };
	if (typeof value !== "string" || value.trim().length > MAX_GITHUB_TOKEN_CHARS || /\s/.test(value.trim())) {
		return { ok: false, response: badRequest(c, "githubToken must be a GitHub token") };
	}
	try {
		return { ok: true, value: await encryptGithubToken(c.env, value.trim()) };
	} catch {
		return { ok: false, response: json(c, { error: "encryption_unavailable", message: "Token encryption is not configured" }, 503) };
	}
}

accountWorkSettingsRouter.post("/github-repos", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (!isGithubRepo(body.repo)) return badRequest(c, "repo must look like owner/name");
	const syncIssues = optionalBoolean(body, "syncIssues");
	if (syncIssues.ok === false) return badRequest(c, syncIssues.message);
	const harness = parseHarness(body.harness);
	if (harness === null) return badRequest(c, "harness must be claude-code or codex");
	const model = parseModel(body.model);
	if (model === null) return badRequest(c, "model is not valid");
	const token = await encryptedToken(c, body.githubToken);
	if (token.ok === false) return token.response;
	const bridge = await newWorkToken("github");
	const { data, error } = await context.client.from("work_github_repos").insert({
		workspace_id: context.workspaceId,
		repo: body.repo,
		bridge_token_hash: bridge.hash,
		bridge_token_prefix: bridge.prefix,
		github_token_ciphertext: token.value ?? null,
		sync_issues: syncIssues.value ?? true,
		created_by: context.user.id,
	}).select(GITHUB_REPO_COLUMNS).maybeSingle();
	if (error || !data) return writeError(c, error, "This repository is already linked");
	const row = data as unknown as GithubRepoRow;
	return json(c, {
		repo: formatGithubRepo(row),
		bridgeToken: bridge.token,
		workflow: buildGithubWorkflow({ repo: row.repo, harness: harness ?? undefined, model: model ?? undefined }),
	}, 201);
});

accountWorkSettingsRouter.get("/github-repos/:id/workflow", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A repository id is required");
	const harness = parseHarness(c.req.query("harness"));
	if (harness === null) return badRequest(c, "harness must be claude-code or codex");
	const model = parseModel(c.req.query("model"));
	if (model === null) return badRequest(c, "model is not valid");
	const { data, error } = await context.client.from("work_github_repos").select("repo").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) return unavailable(c);
	if (!data) return notFound(c, "Repository not found");
	// The workflow refers to the bridge token as a repository secret; it never contains it.
	return json(c, { workflow: buildGithubWorkflow({ repo: String(data.repo), harness: harness ?? undefined, model: model ?? undefined }) });
});

accountWorkSettingsRouter.patch("/github-repos/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A repository id is required");
	const patch: Record<string, unknown> = {};
	const syncIssues = optionalBoolean(body, "syncIssues");
	if (syncIssues.ok === false) return badRequest(c, syncIssues.message);
	if (syncIssues.value !== undefined) patch.sync_issues = syncIssues.value;
	const token = await encryptedToken(c, body.githubToken);
	if (token.ok === false) return token.response;
	if (token.value !== undefined) patch.github_token_ciphertext = token.value;
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_github_repos").update(patch)
		.eq("workspace_id", context.workspaceId).eq("id", id).select(GITHUB_REPO_COLUMNS).maybeSingle();
	if (error) return writeError(c, error);
	if (!data) return notFound(c, "Repository not found");
	return json(c, { repo: formatGithubRepo(data as unknown as GithubRepoRow) });
});

accountWorkSettingsRouter.delete("/github-repos/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A repository id is required");
	const { data, error } = await context.client.from("work_github_repos").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Repository not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Error projects: source map upload token, source maps, releases, rules
// ---------------------------------------------------------------------------------------------

async function loadErrorProjectId(c: any, context: { client: any; workspaceId: string }): Promise<{ id: string } | { response: Response }> {
	const id = pathUuid(c, "id");
	if (!id) return { response: badRequest(c, "An error project id is required") };
	const { data, error } = await context.client.from("work_error_projects").select("id").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) return { response: unavailable(c) };
	if (!data) return { response: notFound(c, "Error project not found") };
	return { id };
}

/** Makes (or replaces) the project's source map upload token. The token is returned once. */
accountWorkSettingsRouter.post("/error-projects/:id/upload-key", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	const key = await newWorkToken("uploads");
	const { data, error } = await context.client.from("work_error_projects").update({ upload_key_hash: key.hash, upload_key_prefix: key.prefix })
		.eq("workspace_id", context.workspaceId).eq("id", project.id).select(ERROR_PROJECT_COLUMNS).maybeSingle();
	if (error || !data) return writeError(c, error);
	return json(c, { project: formatErrorProject(data as unknown as ErrorProjectRow), uploadKey: key.token }, 201);
});

accountWorkSettingsRouter.get("/error-projects/:id/sourcemaps", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	let query = context.client.from("work_error_sourcemaps").select(SOURCEMAP_COLUMNS).eq("workspace_id", context.workspaceId).eq("project_id", project.id);
	const release = c.req.query("release")?.trim();
	if (release) query = query.eq("release", release.slice(0, 200));
	const { data, error } = await query.order("created_at", { ascending: false }).limit(clampLimit(c.req.query("limit"), 100, 200));
	if (error) return unavailable(c);
	return json(c, { sourcemaps: ((data ?? []) as SourcemapRow[]).map(formatSourcemap), available: Boolean(c.env.WORK_SOURCEMAPS) });
});

accountWorkSettingsRouter.delete("/error-projects/:id/sourcemaps/:mapId", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	const mapId = pathUuid(c, "mapId");
	if (!mapId) return badRequest(c, "A source map id is required");
	const { data, error } = await context.client.from("work_error_sourcemaps").delete()
		.eq("workspace_id", context.workspaceId).eq("project_id", project.id).eq("id", mapId).select("id,object_key").maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Source map not found");
	if (c.env.WORK_SOURCEMAPS) {
		try {
			await c.env.WORK_SOURCEMAPS.delete(String(data.object_key));
		} catch (deleteError) {
			console.error("[work] source map object not deleted", { mapId, message: deleteError instanceof Error ? deleteError.message : String(deleteError) });
		}
	}
	return json(c, { id: mapId, deleted: true });
});

accountWorkSettingsRouter.get("/error-projects/:id/releases", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	const { data, error } = await context.client.from("work_error_releases").select("version,first_seen_at,last_seen_at,event_count,new_groups")
		.eq("project_id", project.id).order("last_seen_at", { ascending: false }).limit(clampLimit(c.req.query("limit"), 30, 100));
	if (error) return unavailable(c);
	return json(c, { releases: (data ?? []).map((row: any) => formatErrorRelease(row)) });
});

accountWorkSettingsRouter.get("/error-projects/:id/rules", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	const { data, error } = await context.client.from("work_error_rules").select(ERROR_RULE_COLUMNS)
		.eq("workspace_id", context.workspaceId).eq("project_id", project.id).order("created_at", { ascending: true }).limit(MAX_RULES_PER_PROJECT);
	if (error) return unavailable(c);
	return json(c, { rules: ((data ?? []) as ErrorRuleRow[]).map(formatErrorRule) });
});

accountWorkSettingsRouter.post("/error-projects/:id/rules", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await loadErrorProjectId(c, context);
	if ("response" in project) return project.response;
	const parsed = parseRuleInput(body);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	if (parsed.value.assigneeUserId) {
		const member = await context.client.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", parsed.value.assigneeUserId).maybeSingle();
		if (member.error) return unavailable(c);
		if (!member.data) return badRequest(c, "The assignee isn't a member of this workspace");
	}
	const count = await context.client.from("work_error_rules").select("id", { count: "exact", head: true }).eq("project_id", project.id);
	if (count.error) return unavailable(c);
	if ((count.count ?? 0) >= MAX_RULES_PER_PROJECT) return badRequest(c, `A project can have at most ${MAX_RULES_PER_PROJECT} rules`);
	const { data, error } = await context.client.from("work_error_rules").insert({
		workspace_id: context.workspaceId,
		project_id: project.id,
		action: parsed.value.action,
		field: parsed.value.field,
		pattern: parsed.value.pattern,
		assignee_user_id: parsed.value.assigneeUserId,
		created_by: context.user.id,
	}).select(ERROR_RULE_COLUMNS).maybeSingle();
	if (error || !data) return writeError(c, error);
	return json(c, { rule: formatErrorRule(data as ErrorRuleRow) }, 201);
});

accountWorkSettingsRouter.patch("/error-rules/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A rule id is required");
	const enabled = optionalBoolean(body, "enabled");
	if (enabled.ok === false) return badRequest(c, enabled.message);
	if (enabled.value === undefined) return badRequest(c, "Send enabled: true or false");
	const { data, error } = await context.client.from("work_error_rules").update({ enabled: enabled.value })
		.eq("workspace_id", context.workspaceId).eq("id", id).select(ERROR_RULE_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Rule not found");
	return json(c, { rule: formatErrorRule(data as ErrorRuleRow) });
});

accountWorkSettingsRouter.delete("/error-rules/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A rule id is required");
	const { data, error } = await context.client.from("work_error_rules").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_settings_write_failed");
	if (!data) return notFound(c, "Rule not found");
	return json(c, { id, deleted: true });
});
