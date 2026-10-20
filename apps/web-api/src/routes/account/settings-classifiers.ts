import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { ensureChatGatewayKey, resolveGatewayBaseUrlForEnvironment } from "@/chat/proxy";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import {
	CLASSIFIER_COLUMNS,
	CLASSIFIER_TEST_LABEL_KEY,
	MAX_CLASSIFIERS_PER_WORKSPACE,
	buildClassifierRequest,
	classifierRequestFormat,
	formatClassifier,
	loadClassifierModelCapabilities,
	parseClassifierAnswer,
	parseClassifierFields,
	type ClassifierRequestFormat,
	type ClassifierRow,
} from "./request-classifiers";

// Request classifiers for the workspace settings page. Validation and the
// classification request come from the shared module the gateway uses, so the
// page, this API and the gateway always agree. Saving a row changes the
// workspace's gateway publication through a database trigger, so the gateway
// picks it up within about a minute without an explicit invalidation.
//
// Classifiers decide what request content is sent to a model, so only owners
// and admins can read or change them.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_LABEL_VALUE = "draft";
const MAX_SAMPLE_CHARS = 8_000;
const TEST_TIMEOUT_MS = 30_000;
/** A refused schema request is retried once as prompted JSON, as the gateway does. */
const SCHEMA_REFUSED_STATUSES = new Set([400, 422]);

type Body = Record<string, unknown>;

function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

function badRequest(c: any, message: string) {
	return json(c, { error: "bad_request", message }, 400);
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

function isManager(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

/** The body also carries workspaceId, which the shared parser would reject as an unknown field. */
function classifierInput(body: Body): Body {
	const { workspaceId: _workspaceId, ...input } = body;
	return input;
}

async function managerContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	if (!context) return { response: json(c, { error: "forbidden" }, 403) } as const;
	if (!isManager(context)) return { response: json(c, { error: "forbidden", message: "Only workspace owners and admins can manage classifiers" }, 403) } as const;
	return { context } as const;
}

function classifierId(c: any): string | null {
	const id = String(c.req.param("classifierId") ?? "").trim();
	return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

/** The first day of the current UTC month, the key of the spend table. */
export function currentSpendMonth(now = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Maps the table's constraint errors to 400/409; anything else is unexpected. */
function writeError(c: any, error: { code?: string; message?: string }) {
	if (error.code === "23505") return json(c, { error: "conflict", message: "A classifier with this name already exists" }, 409);
	if (error.code === "23514" && error.message?.includes("request_classifier_limit_reached")) {
		return badRequest(c, `A workspace can have at most ${MAX_CLASSIFIERS_PER_WORKSPACE} classifiers`);
	}
	if (error.code === "23514") return badRequest(c, "The classifier is not valid");
	return json(c, { error: "classifier_write_failed" }, 503);
}

async function audit(context: AccountWorkspaceContext, action: "created" | "updated" | "deleted", row: ClassifierRow) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `request_classifier.${action}`,
		targetType: "request_classifier",
		targetId: row.id,
		targetName: row.name,
		metadata: {
			enabled: row.enabled,
			model: row.model,
			dimension_keys: (row.dimensions ?? []).map((dimension) => dimension.key),
			sample_rate_bps: row.sample_rate_bps,
			input_scope: row.input_scope,
			monthly_budget_nanos: row.monthly_budget_nanos == null ? null : Number(row.monthly_budget_nanos),
		},
	});
}

export const accountSettingsClassifiersRouter = new Hono<{ Bindings: Env }>();

accountSettingsClassifiersRouter.get("/classifiers", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	const empty = { canManageClassifiers: false, classifiers: [], keys: [], apps: [], month: currentSpendMonth(), limit: MAX_CLASSIFIERS_PER_WORKSPACE };
	if (!workspaceId) return json(c, { ...empty, workspaceId: null });
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return json(c, { error: "forbidden" }, 403);
	// Members see that the page exists but not what is classified or how.
	if (!isManager(context)) return json(c, { ...empty, workspaceId });
	const month = currentSpendMonth();
	const [classifiers, spend, keys, apps] = await Promise.all([
		context.client.from("workspace_request_classifiers").select(CLASSIFIER_COLUMNS)
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.limit(MAX_CLASSIFIERS_PER_WORKSPACE),
		// One pre-aggregated row per classifier for the month (at most five).
		context.client.from("workspace_request_classifier_spend_monthly").select("classifier_id,classifications,cost_nanos")
			.eq("workspace_id", workspaceId).eq("month", month)
			.limit(MAX_CLASSIFIERS_PER_WORKSPACE),
		context.client.from("keys").select("id,name,prefix,status")
			.eq("workspace_id", workspaceId).neq("status", "deleted")
			.neq("name", "__chat_route_managed_key__").order("created_at", { ascending: false }),
		context.client.from("api_apps").select("id,title")
			.eq("workspace_id", workspaceId).order("last_seen", { ascending: false }),
	]);
	if (classifiers.error || spend.error || keys.error || apps.error) return json(c, { error: "settings_unavailable" }, 503);
	const usage = new Map((spend.data ?? []).map((row: any) => [String(row.classifier_id), {
		classifications: Number(row.classifications) || 0,
		costUsd: (Number(row.cost_nanos) || 0) / 1e9,
	}]));
	return json(c, {
		canManageClassifiers: true,
		workspaceId,
		month,
		limit: MAX_CLASSIFIERS_PER_WORKSPACE,
		classifiers: (classifiers.data ?? []).map((row) => {
			const classifier = formatClassifier(row as unknown as ClassifierRow);
			return { ...classifier, usage: usage.get(classifier.id) ?? { classifications: 0, costUsd: 0 } };
		}),
		keys: (keys.data ?? []).map((key: any) => ({ id: String(key.id), name: String(key.name ?? ""), prefix: String(key.prefix ?? ""), status: String(key.status ?? "") })),
		apps: (apps.data ?? []).map((app: any) => ({ id: String(app.id), title: String(app.title ?? "") })),
	});
});

accountSettingsClassifiersRouter.post("/classifiers", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	for (const field of ["name", "model", "dimensions"] as const) {
		if (body[field] === undefined) return badRequest(c, `${field} is required`);
	}
	const fields = parseClassifierFields(classifierInput(body));
	if (fields.ok === false) return badRequest(c, fields.message);
	const { context } = access;
	const result = await context.client.from("workspace_request_classifiers").insert({
		...fields.value,
		workspace_id: context.workspaceId,
		created_by: context.user.id,
	}).select(CLASSIFIER_COLUMNS).maybeSingle();
	if (result.error) return writeError(c, result.error);
	const row = result.data as unknown as ClassifierRow;
	await audit(context, "created", row);
	return json(c, { classifier: formatClassifier(row) }, 201);
});

accountSettingsClassifiersRouter.put("/classifiers/:classifierId", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = classifierId(c);
	if (!id) return badRequest(c, "A classifier id is required");
	const fields = parseClassifierFields(classifierInput(body));
	if (fields.ok === false) return badRequest(c, fields.message);
	if (Object.keys(fields.value).length === 0) return badRequest(c, "Provide at least one field to update");
	const { context } = access;
	const result = await context.client.from("workspace_request_classifiers").update(fields.value)
		.eq("workspace_id", context.workspaceId).eq("id", id).select(CLASSIFIER_COLUMNS).maybeSingle();
	if (result.error) return writeError(c, result.error);
	if (!result.data) return json(c, { error: "not_found", message: "Classifier not found" }, 404);
	const row = result.data as unknown as ClassifierRow;
	await audit(context, "updated", row);
	return json(c, { classifier: formatClassifier(row) });
});

accountSettingsClassifiersRouter.delete("/classifiers/:classifierId", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = classifierId(c);
	if (!id) return badRequest(c, "A classifier id is required");
	const { context } = access;
	const result = await context.client.from("workspace_request_classifiers").delete()
		.eq("workspace_id", context.workspaceId).eq("id", id).select(CLASSIFIER_COLUMNS).maybeSingle();
	if (result.error) return json(c, { error: "classifier_write_failed" }, 503);
	if (!result.data) return json(c, { error: "not_found", message: "Classifier not found" }, 404);
	const row = result.data as unknown as ClassifierRow;
	await audit(context, "deleted", row);
	return json(c, { id: row.id, deleted: true });
});

function sampleText(value: unknown, field: string, required: boolean): { ok: true; value: string } | { ok: false; message: string } {
	if (value === undefined || value === null || value === "") {
		return required ? { ok: false, message: `${field} is required` } : { ok: true, value: "" };
	}
	if (typeof value !== "string" || value.length > MAX_SAMPLE_CHARS) return { ok: false, message: `${field} must be at most ${MAX_SAMPLE_CHARS} characters` };
	const text = value.trim();
	if (required && !text) return { ok: false, message: `${field} is required` };
	return { ok: true, value: text };
}

/**
 * Runs a draft classifier once on a sample, with the same request the gateway
 * sends (in the same format), through the gateway as the signed-in member. It is billed like any
 * classification and labelled phaseo.classifier_test (the saved id, or "draft");
 * phaseo.classifier itself is reserved for the gateway's own classifier calls.
 */
accountSettingsClassifiersRouter.post("/classifiers/test", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const draft = body.classifier && typeof body.classifier === "object" ? body.classifier as Body : {};
	if (draft.model === undefined || draft.dimensions === undefined) return badRequest(c, "classifier.model and classifier.dimensions are required");
	const fields = parseClassifierFields({ model: draft.model, dimensions: draft.dimensions, instructions: draft.instructions ?? "" });
	if (fields.ok === false) return badRequest(c, fields.message);
	const sample = body.sample && typeof body.sample === "object" ? body.sample as Body : {};
	const prompt = sampleText(sample.prompt, "sample.prompt", true);
	if (prompt.ok === false) return badRequest(c, prompt.message);
	const reply = sampleText(sample.response, "sample.response", false);
	if (reply.ok === false) return badRequest(c, reply.message);
	const savedId = typeof body.classifierId === "string" && UUID_PATTERN.test(body.classifierId) ? body.classifierId.toLowerCase() : null;

	const { context } = access;
	const key = await ensureChatGatewayKey(c.env, { user: context.user, client: context.client, workspaceId: context.workspaceId }, (promise) => c.executionCtx.waitUntil(promise));
	// The settings page maps these codes to its own copy (for example, a link to review Chat privacy).
	if ("status" in key) return json(c, { error: key.code }, key.status);
	const baseUrl = resolveGatewayBaseUrlForEnvironment({
		configuredBaseUrl: c.env.AI_STATS_GATEWAY_URL ?? c.env.PHASEO_GATEWAY_URL,
		stagingBaseUrl: c.env.STAGING_GATEWAY_BASE_URL,
		environment: c.env.ENV,
	});
	if (!baseUrl) return json(c, { error: "gateway_unavailable" }, 503);

	const dimensions = fields.value.dimensions!;
	const transcript = [`USER: ${prompt.value}`, ...(reply.value ? [`RESPONSE: ${reply.value}`] : [])].join("\n\n");
	const config = { model: fields.value.model!, instructions: fields.value.instructions ?? "" };
	// The same choice the gateway makes: structured outputs, then Decisions, then prompted JSON.
	let format: ClassifierRequestFormat = await loadClassifierModelCapabilities(context.client, config.model)
		.then(classifierRequestFormat)
		.catch(() => "json_schema" as const);
	const send = (requestFormat: ClassifierRequestFormat) => {
		const request = buildClassifierRequest(config, dimensions, transcript, requestFormat);
		return fetch(`${baseUrl}/${request.path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key.apiKey}`,
				"Content-Type": "application/json",
				"x-phaseo-metadata": JSON.stringify({ labels: [{ key: CLASSIFIER_TEST_LABEL_KEY, value: savedId ?? DRAFT_LABEL_VALUE }] }),
			},
			body: JSON.stringify(request.body),
			signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
		});
	};
	let response: Response;
	let payload: Record<string, any> | null;
	try {
		response = await send(format);
		payload = await response.json().catch(() => null) as Record<string, any> | null;
		if (format === "json_schema" && SCHEMA_REFUSED_STATUSES.has(response.status)) {
			format = "json";
			response = await send(format);
			payload = await response.json().catch(() => null) as Record<string, any> | null;
		}
	} catch {
		return json(c, { error: "gateway_unavailable", message: "The gateway did not answer in time" }, 504);
	}
	if (!response.ok) {
		const message = typeof payload?.error?.message === "string" ? payload.error.message
			: typeof payload?.message === "string" ? payload.message
			: `The gateway returned ${response.status}`;
		return json(c, { error: "classifier_test_failed", status: response.status, message }, 502);
	}
	const labels = parseClassifierAnswer(payload, dimensions);
	const costNanos = Number(payload?.cost_nanos ?? 0) || 0;
	return json(c, {
		labels: labels ?? [],
		answered: labels !== null,
		costUsd: costNanos / 1e9,
		model: typeof payload?.model === "string" ? payload.model : fields.value.model,
		format,
		requestId: response.headers.get("x-phaseo-request-id") ?? response.headers.get("x-request-id")
			?? (typeof payload?.id === "string" ? payload.id : typeof payload?.request_id === "string" ? payload.request_id : null),
	});
});
