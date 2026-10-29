// Runs a classifier once on a sample: the API side of the dashboard's
// classifier test. The request is the one the gateway sends for the
// classifier (same format choice and fallback), made through the gateway with
// the caller's own credential and labelled phaseo.classifier_test (the saved
// id, or "draft"), so it is billed and logged like the dashboard's test.
//
// The dashboard runs its test with the signed-in member's chat key. This route
// never creates a key: the credential must already be allowed to make
// inference requests (an OAuth token with gateway:access) as well as manage
// classifiers. Management keys cannot make inference requests, so they are
// refused rather than given one.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { CAPABILITIES, GATEWAY_ACCESS_SCOPE } from "@/lib/authz/capabilities";
import { getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { getRequestClassifierHandler } from "@pipeline/index";
import {
	CLASSIFIER_COLUMNS,
	CLASSIFIER_TEST_LABEL_KEY,
	buildClassifierRequest,
	classifierRequestFormat,
	loadClassifierModelCapabilities,
	parseClassifierAnswer,
	parseClassifierFields,
	type ClassifierRequestFormat,
	type ClassifierRow,
} from "@core/request-classifiers";
import { internalServerError, isResponse, requireJsonBody } from "./route-helpers";
import { authorizeClassifiers } from "./classifiers";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_LABEL_VALUE = "draft";
const MAX_SAMPLE_CHARS = 8_000;
/** A refused schema request is retried once as prompted JSON, as the gateway does. */
const SCHEMA_REFUSED_STATUSES = new Set([400, 422]);

function badRequest(message: string) {
	return json({ error: "bad_request", message }, 400, NO_STORE);
}

function sampleText(value: unknown, field: string, required: boolean): { ok: true; value: string } | { ok: false; message: string } {
	if (value === undefined || value === null || value === "") {
		return required ? { ok: false, message: `${field} is required` } : { ok: true, value: "" };
	}
	if (typeof value !== "string" || value.length > MAX_SAMPLE_CHARS) return { ok: false, message: `${field} must be at most ${MAX_SAMPLE_CHARS} characters` };
	const text = value.trim();
	if (required && !text) return { ok: false, message: `${field} is required` };
	return { ok: true, value: text };
}

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function handleTestClassifier(req: Request) {
	const authorization = await authorizeClassifiers(req, CAPABILITIES.CLASSIFIERS_WRITE);
	if ("response" in authorization) return authorization.response;
	const { auth } = authorization;
	const grantedScopes = new Set([...(auth.scopes ?? []), ...(auth.oauthScopes ?? [])]);
	if (auth.authMethod !== "oauth" || !grantedScopes.has(GATEWAY_ACCESS_SCOPE)) {
		return json({
			error: "gateway_access_required",
			message: `Testing a classifier sends a billed model request, so it needs a credential with ${GATEWAY_ACCESS_SCOPE} as well as ${CAPABILITIES.CLASSIFIERS_WRITE}. Management keys cannot make model requests; sign in with OAuth and include ${GATEWAY_ACCESS_SCOPE}.`,
		}, 403, NO_STORE);
	}

	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const rawId = body.classifier_id ?? body.classifierId;
	if (rawId !== undefined && (typeof rawId !== "string" || !UUID_PATTERN.test(rawId))) return badRequest("classifier_id must be a classifier id");
	const savedId = typeof rawId === "string" ? rawId.toLowerCase() : null;
	const draft = object(body.classifier);
	if (!draft && !savedId) return badRequest("Send classifier (model, dimensions, instructions) or classifier_id");
	const sample = object(body.sample) ?? {};
	const prompt = sampleText(sample.prompt, "sample.prompt", true);
	if (prompt.ok === false) return badRequest(prompt.message);
	const reply = sampleText(sample.response, "sample.response", false);
	if (reply.ok === false) return badRequest(reply.message);

	try {
		return await runTest(req, auth.workspaceId, savedId, draft, prompt.value, reply.value);
	} catch (error) {
		return internalServerError("classifiers.test", error);
	}
}

async function runTest(req: Request, workspaceId: string, savedId: string | null, draft: Record<string, unknown> | null, prompt: string, reply: string) {
	let saved: ClassifierRow | null = null;
	if (savedId) {
		// Only this workspace's classifiers; another workspace's id is not found.
		const { data, error } = await getSupabaseAdmin().from("workspace_request_classifiers").select(CLASSIFIER_COLUMNS)
			.eq("workspace_id", workspaceId).eq("id", savedId).maybeSingle();
		if (error) throw error;
		if (!data) return json({ error: "not_found", message: "Classifier not found" }, 404, NO_STORE);
		saved = data as unknown as ClassifierRow;
	}
	const source = draft ?? {};
	const fields = parseClassifierFields({
		model: source.model ?? saved?.model,
		dimensions: source.dimensions ?? saved?.dimensions,
		instructions: source.instructions ?? saved?.instructions ?? "",
	});
	if (fields.ok === false) return badRequest(fields.message);
	if (!fields.value.model || !fields.value.dimensions?.length) return badRequest("classifier.model and classifier.dimensions are required");

	const dimensions = fields.value.dimensions;
	const config = { model: fields.value.model, instructions: fields.value.instructions ?? "" };
	const transcript = [`USER: ${prompt}`, ...(reply ? [`RESPONSE: ${reply}`] : [])].join("\n\n");
	// The same choice the gateway makes: structured outputs, then Decisions, then prompted JSON.
	let format: ClassifierRequestFormat = await loadClassifierModelCapabilities(getSupabaseAdmin(), config.model)
		.then(classifierRequestFormat)
		.catch(() => "json_schema" as const);
	const send = (requestFormat: ClassifierRequestFormat) => {
		const request = buildClassifierRequest(config, dimensions, transcript, requestFormat);
		return getRequestClassifierHandler(request.path)(new Request(`https://phaseo.local/v1/${request.path}`, {
			method: "POST",
			headers: {
				// The caller's own credential: the gateway checks its inference access and bills it.
				Authorization: req.headers.get("authorization") ?? "",
				"Content-Type": "application/json",
				"x-phaseo-metadata": JSON.stringify({ labels: [{ key: CLASSIFIER_TEST_LABEL_KEY, value: savedId ?? DRAFT_LABEL_VALUE }] }),
			},
			body: JSON.stringify(request.body),
		}));
	};
	let response = await send(format);
	let payload = await response.json().catch(() => null) as Record<string, any> | null;
	if (format === "json_schema" && SCHEMA_REFUSED_STATUSES.has(response.status)) {
		format = "json";
		response = await send(format);
		payload = await response.json().catch(() => null) as Record<string, any> | null;
	}
	if (!response.ok) {
		const message = typeof payload?.error?.message === "string" ? payload.error.message
			: typeof payload?.message === "string" ? payload.message
			: `The gateway returned ${response.status}`;
		return json({ error: "classifier_test_failed", status: response.status, message }, 502, NO_STORE);
	}
	const labels = parseClassifierAnswer(payload, dimensions);
	const costNanos = Number(payload?.cost_nanos ?? 0) || 0;
	return json({
		data: {
			labels: labels ?? [],
			answered: labels !== null,
			cost_usd: costNanos / 1e9,
			model: typeof payload?.model === "string" ? payload.model : config.model,
			format,
			request_id: response.headers.get("x-phaseo-request-id") ?? response.headers.get("x-request-id")
				?? (typeof payload?.id === "string" ? payload.id : typeof payload?.request_id === "string" ? payload.request_id : null),
		},
	}, 200, NO_STORE);
}

export const classifierTestRoutes = new Hono<Env>();

classifierTestRoutes.post("/test", withRuntime(handleTestClassifier));
