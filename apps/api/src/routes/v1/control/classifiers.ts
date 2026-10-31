import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import { getRequestClassifiersFeatureGateName, isRequestClassifiersAccessEnabled } from "@core/feature-flags";
import {
	CLASSIFIER_COLUMNS,
	MAX_CLASSIFIERS_PER_WORKSPACE,
	formatClassifier,
	parseClassifierFields,
	type ClassifierRow,
} from "@core/request-classifiers";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import {
	internalServerError,
	isResponse,
	parsePathId,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

// Saving a classifier changes the workspace's gateway publication (database
// trigger), so the gateway picks up the new configuration within about a minute.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

function badRequest(message: string) {
	return json({ error: "bad_request", message }, 400, NO_STORE);
}

function notFound() {
	return json({ error: "not_found", message: "Classifier not found" }, 404, NO_STORE);
}

function conflict() {
	return json({ error: "conflict", message: "A classifier with this name already exists" }, 409, NO_STORE);
}

function limitReached() {
	return badRequest(`A workspace can have at most ${MAX_CLASSIFIERS_PER_WORKSPACE} classifiers`);
}

function featureDisabled(workspaceId: string) {
	return json({
		error: "forbidden",
		reason: "request_classifiers_feature_flag_disabled",
		message: "Request classifiers are in beta and not yet enabled for this workspace.",
		feature_gate: getRequestClassifiersFeatureGateName(),
		workspace_id: workspaceId,
	}, 403, NO_STORE);
}

function parseId(req: Request): string | null {
	const id = parsePathId(new URL(req.url), "classifiers");
	return id && UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

function actorUserId(auth: { userId?: string | null }): string | null {
	return auth.userId?.trim() || null;
}

/** Classifiers see request content, so only owners and admins manage or read them. */
export async function authorizeClassifiers(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError } as const;
	// Decided for the workspace (its owner), the same way the gateway decides whether to classify.
	if (!(await isRequestClassifiersAccessEnabled({ workspaceId: auth.value.workspaceId }))) {
		return { response: featureDisabled(auth.value.workspaceId) } as const;
	}
	return { auth: auth.value } as const;
}

async function audit(
	auth: { workspaceId: string; userId?: string | null },
	action: "created" | "updated" | "deleted",
	row: ClassifierRow,
) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `request_classifier.${action}`,
		targetType: "request_classifier",
		targetId: row.id,
		targetName: row.name,
		metadata: {
			enabled: row.enabled,
			model: row.model,
			dimension_keys: (row.dimensions ?? []).map((dimension) => dimension.key),
			sample_rate_bps: row.sample_rate_bps,
			// The audit sanitizer drops keys containing "scope".
			classified_input: row.input_scope,
			monthly_budget_nanos: row.monthly_budget_nanos == null ? null : Number(row.monthly_budget_nanos),
		},
	});
}

/** Maps the table's constraint errors to the API's 400/409 responses. */
function writeError(error: { code?: string; message?: string }): Response | null {
	if (error.code === "23505") return conflict();
	if (error.code === "23514" && error.message?.includes("request_classifier_limit_reached")) return limitReached();
	if (error.code === "23514") return badRequest("The classifier is not valid");
	return null;
}

async function handleList(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_READ);
	if ("response" in authorization) return authorization.response;
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").select(CLASSIFIER_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.limit(MAX_CLASSIFIERS_PER_WORKSPACE);
		if (error) throw error;
		return json({ data: (data ?? []).map((row) => formatClassifier(row as ClassifierRow)) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("classifiers.list", error);
	}
}

async function handleCreate(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_WRITE);
	if ("response" in authorization) return authorization.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	for (const field of ["name", "model", "dimensions"] as const) {
		if (body[field] === undefined) return badRequest(`${field} is required`);
	}
	const fields = parseClassifierFields(body);
	if (fields.ok === false) return badRequest(fields.message);
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").insert({
			...fields.value,
			workspace_id: authorization.auth.workspaceId,
			created_by: actorUserId(authorization.auth),
		}).select(CLASSIFIER_COLUMNS).maybeSingle();
		if (error) {
			const response = writeError(error);
			if (response) return response;
			throw error;
		}
		const row = data as ClassifierRow;
		await audit(authorization.auth, "created", row);
		return json({ data: formatClassifier(row) }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("classifiers.create", error);
	}
}

async function handleGet(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_READ);
	if ("response" in authorization) return authorization.response;
	const id = parseId(req);
	if (!id) return badRequest("A classifier id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").select(CLASSIFIER_COLUMNS)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).maybeSingle();
		if (error) throw error;
		if (!data) return notFound();
		return json({ data: formatClassifier(data as ClassifierRow) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("classifiers.get", error);
	}
}

async function handleUpdate(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_WRITE);
	if ("response" in authorization) return authorization.response;
	const id = parseId(req);
	if (!id) return badRequest("A classifier id is required");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const fields = parseClassifierFields(body);
	if (fields.ok === false) return badRequest(fields.message);
	if (Object.keys(fields.value).length === 0) return badRequest("Provide at least one field to update");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").update(fields.value)
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(CLASSIFIER_COLUMNS).maybeSingle();
		if (error) {
			const response = writeError(error);
			if (response) return response;
			throw error;
		}
		if (!data) return notFound();
		const row = data as ClassifierRow;
		await audit(authorization.auth, "updated", row);
		return json({ data: formatClassifier(row) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("classifiers.update", error);
	}
}

async function handleDelete(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_DELETE);
	if ("response" in authorization) return authorization.response;
	const id = parseId(req);
	if (!id) return badRequest("A classifier id is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").delete()
			.eq("workspace_id", authorization.auth.workspaceId).eq("id", id).select(CLASSIFIER_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound();
		const row = data as ClassifierRow;
		await audit(authorization.auth, "deleted", row);
		return json({ data: { id: row.id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("classifiers.delete", error);
	}
}

export const classifiersRoutes = new Hono<Env>();
classifiersRoutes.get("/", withRuntime(handleList));
classifiersRoutes.post("/", withRuntime(handleCreate));
classifiersRoutes.get("/:id", withRuntime(handleGet));
classifiersRoutes.patch("/:id", withRuntime(handleUpdate));
classifiersRoutes.delete("/:id", withRuntime(handleDelete));
