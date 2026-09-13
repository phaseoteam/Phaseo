import { Hono } from "hono";
import {
	buildPrivateModelId,
	normalizePositiveInteger,
	normalizePrivateModelBaseUrl,
	normalizePrivateModelSecret,
} from "@/core/private-models";
import { encryptProviderCredential } from "@/core/provider-credentials";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	internalServerError,
	parsePathId,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_COLUMNS = [
	"id", "workspace_id", "model_id", "name", "description", "base_url", "upstream_model_id",
	"supports_responses", "enabled", "input_modalities", "output_modalities", "context_length",
	"max_output_tokens", "local_slug", "catalog_model_id", "host_provider_id", "custom_provider_name", "custom_provider_url", "routing_policy", "credential_prefix", "credential_suffix", "created_at", "updated_at", "created_by",
].join(",");
const INPUT_ERROR = /^(model_id|slug|base_url|credential|name|upstream_model_id|context_length|max_output_tokens)/;

function formatPrivateModel(row: Record<string, any>) {
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		model_id: row.model_id,
		name: row.name,
		description: row.description ?? null,
		base_url: row.base_url,
		upstream_model_id: row.upstream_model_id,
		supports_responses: row.supports_responses === true,
		enabled: row.enabled !== false,
		input_modalities: row.input_modalities ?? ["text"],
		output_modalities: row.output_modalities ?? ["text"],
		context_length: row.context_length ?? null,
		max_output_tokens: row.max_output_tokens ?? null,
		local_slug: row.local_slug,
		catalog_model_id: row.catalog_model_id ?? null,
		host_provider_id: row.host_provider_id ?? null,
		custom_provider_name: row.custom_provider_name ?? null,
		custom_provider_url: row.custom_provider_url ?? null,
		routing_policy: row.routing_policy ?? "preferred",
		// Never return both stored fragments: short accepted credentials could be
		// reconstructed when the prefix and suffix overlap.
		credential_prefix: null,
		credential_suffix: row.credential_suffix ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
		created_by: row.created_by ?? null,
	};
}

async function authorize(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError };
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError };
	return { auth: auth.value };
}

function inputError(error: unknown): Response | null {
	if (!(error instanceof Error) || !INPUT_ERROR.test(error.message)) return null;
	return json({ error: "bad_request", message: error.message }, 400, { "Cache-Control": "no-store" });
}

function text(value: unknown, field: string, max: number): string {
	const normalized = String(value ?? "").trim();
	if (!normalized || normalized.length > max) throw new Error(`${field} is required and must contain at most ${max} characters`);
	return normalized;
}

async function findPrivateModel(workspaceId: string, id: string) {
	const { data, error } = await getSupabaseAdmin().from("workspace_private_models")
		.select(`${SAFE_COLUMNS},provider_id`).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw error;
	return data as Record<string, any> | null;
}

async function getWorkspaceNamespace(workspaceId: string): Promise<string> {
	const { data, error } = await getSupabaseAdmin().from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
	if (error) throw error;
	const slug = String(data?.slug ?? "").trim();
	if (!slug) throw new Error("workspace namespace is unavailable");
	return slug;
}

async function resolveModelIdentity(workspaceId: string, reference: unknown) {
	const namespace = await getWorkspaceNamespace(workspaceId);
	const value = String(reference ?? "").trim().toLowerCase();
	if (value.includes("/")) {
		const { data, error } = await getSupabaseAdmin().from("models").select("model_id").eq("model_id", value).maybeSingle();
		if (error || !data) throw new Error("slug must be an existing catalogue model ID or a short model slug");
		return { model_id: value, catalog_model_id: value, local_slug: value.split("/").at(-1) };
	}
	const localModelId = buildPrivateModelId(namespace, value);
	const { data } = await getSupabaseAdmin().from("models").select("model_id").like("model_id", `%/${value}`).limit(2);
	if (data?.length === 1) return { model_id: data[0].model_id, catalog_model_id: data[0].model_id, local_slug: value };
	return { model_id: localModelId, catalog_model_id: null, local_slug: value };
}

async function audit(auth: any, action: string, row: Record<string, any>, metadata: Record<string, unknown> = {}) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: auth.userId,
		action,
		targetType: "private_model",
		targetId: String(row.id),
		targetName: String(row.name ?? row.model_id),
		metadata: { modelId: row.model_id, ...metadata },
		requestId: auth.requestId,
	});
}

async function handleList(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PRIVATE_MODELS_READ);
	if (authorized.response) return authorized.response;
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_private_models").select(SAFE_COLUMNS)
			.eq("workspace_id", authorized.auth!.workspaceId).order("model_id");
		if (error) throw error;
		return json({ data: (data ?? []).map((row) => formatPrivateModel(row as any)) }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("private_models.list", error); }
}

async function handleCreate(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PRIVATE_MODELS_WRITE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	try {
		const id = crypto.randomUUID();
		const providerId = `private-model:${id}`;
		if (body.model_id !== undefined) throw new Error("model_id is assigned by Phaseo; provide slug instead");
		const identity = await resolveModelIdentity(auth.workspaceId, body.model_reference ?? body.slug);
		const name = text(body.name, "name", 120);
		const upstreamModelId = text(body.upstream_model_id, "upstream_model_id", 255);
		const secret = normalizePrivateModelSecret(body.credential ?? body.api_key);
		const encrypted = await encryptProviderCredential({ plaintext: secret, workspaceId: auth.workspaceId, providerId });
		const payload = {
			id,
			workspace_id: auth.workspaceId,
			...identity,
			name,
			description: typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null,
			base_url: normalizePrivateModelBaseUrl(body.base_url),
			upstream_model_id: upstreamModelId,
			supports_responses: body.supports_responses === true,
			enabled: body.enabled !== false,
			input_modalities: ["text"],
			output_modalities: ["text"],
			context_length: normalizePositiveInteger(body.context_length, "context_length"),
			max_output_tokens: normalizePositiveInteger(body.max_output_tokens, "max_output_tokens"),
			host_provider_id: String(body.host_provider_id ?? "").trim() || null,
			custom_provider_name: String(body.host_provider_id ?? "").trim() ? null : String(body.custom_provider_name ?? "").trim() || "Private endpoint",
			custom_provider_url: String(body.host_provider_id ?? "").trim() ? null : String(body.custom_provider_url ?? "").trim() || null,
			routing_policy: ["preferred", "balanced", "fallback"].includes(String(body.routing_policy)) ? String(body.routing_policy) : "preferred",
			provider_id: providerId,
			enc_value: encrypted.enc_value,
			enc_iv: encrypted.enc_iv,
			enc_tag: encrypted.enc_tag,
			key_version: encrypted.key_version,
			enc_aad_version: 1,
			fingerprint_sha256: encrypted.fingerprint_sha256,
			credential_prefix: encrypted.prefix,
			credential_suffix: encrypted.suffix,
			created_by: auth.userId ?? null,
		};
		const { data, error } = await getSupabaseAdmin().from("workspace_private_models").insert(payload).select(SAFE_COLUMNS).maybeSingle();
		if (error || !data) throw error ?? new Error("Private model was not created");
		await audit(auth, "private_model.created", data as any, { supportsResponses: payload.supports_responses });
		return json({ data: formatPrivateModel(data as any) }, 201, { "Cache-Control": "no-store" });
	} catch (error) { return inputError(error) ?? internalServerError("private_models.create", error); }
}

async function handleGet(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PRIVATE_MODELS_READ);
	if (authorized.response) return authorized.response;
	const id = parsePathId(new URL(req.url), "private-models");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid private model id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const row = await findPrivateModel(authorized.auth!.workspaceId, id);
		if (!row) return json({ error: "not_found", message: "Private model not found" }, 404, { "Cache-Control": "no-store" });
		return json({ data: formatPrivateModel(row) }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("private_models.get", error); }
}

async function handleUpdate(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PRIVATE_MODELS_WRITE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const id = parsePathId(new URL(req.url), "private-models");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid private model id is required" }, 400, { "Cache-Control": "no-store" });
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	try {
		const existing = await findPrivateModel(auth.workspaceId, id);
		if (!existing) return json({ error: "not_found", message: "Private model not found" }, 404, { "Cache-Control": "no-store" });
		const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (body.model_id !== undefined) throw new Error("model_id is assigned by Phaseo; provide slug instead");
		if (body.model_reference !== undefined || body.slug !== undefined) Object.assign(patch, await resolveModelIdentity(auth.workspaceId, body.model_reference ?? body.slug));
		if (body.name !== undefined) patch.name = text(body.name, "name", 120);
		if (body.description !== undefined) patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null;
		if (body.base_url !== undefined) patch.base_url = normalizePrivateModelBaseUrl(body.base_url);
		if (body.upstream_model_id !== undefined) patch.upstream_model_id = text(body.upstream_model_id, "upstream_model_id", 255);
		if (typeof body.supports_responses === "boolean") patch.supports_responses = body.supports_responses;
		if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
		if (body.context_length !== undefined) patch.context_length = normalizePositiveInteger(body.context_length, "context_length");
		if (body.max_output_tokens !== undefined) patch.max_output_tokens = normalizePositiveInteger(body.max_output_tokens, "max_output_tokens");
		if (body.host_provider_id !== undefined || body.custom_provider_name !== undefined || body.custom_provider_url !== undefined) {
			const hostProviderId = body.host_provider_id === undefined
				? String(existing.host_provider_id ?? "").trim() || null
				: String(body.host_provider_id ?? "").trim() || null;
			patch.host_provider_id = hostProviderId;
			if (hostProviderId) {
				patch.custom_provider_name = null;
				patch.custom_provider_url = null;
			} else {
				patch.custom_provider_name = body.custom_provider_name === undefined
					? String(existing.custom_provider_name ?? "").trim() || "Private endpoint"
					: String(body.custom_provider_name ?? "").trim() || "Private endpoint";
				patch.custom_provider_url = body.custom_provider_url === undefined
					? String(existing.custom_provider_url ?? "").trim() || null
					: String(body.custom_provider_url ?? "").trim() || null;
			}
		}
		if (body.routing_policy !== undefined) {
			if (!["preferred", "balanced", "fallback"].includes(String(body.routing_policy))) throw new Error("routing_policy must be preferred, balanced, or fallback");
			patch.routing_policy = body.routing_policy;
		}
		if (body.credential !== undefined || body.api_key !== undefined) {
			const secret = normalizePrivateModelSecret(body.credential ?? body.api_key);
			const encrypted = await encryptProviderCredential({ plaintext: secret, workspaceId: auth.workspaceId, providerId: existing.provider_id });
			Object.assign(patch, {
				enc_value: encrypted.enc_value, enc_iv: encrypted.enc_iv, enc_tag: encrypted.enc_tag,
				key_version: encrypted.key_version, enc_aad_version: 1,
				fingerprint_sha256: encrypted.fingerprint_sha256,
				credential_prefix: encrypted.prefix, credential_suffix: encrypted.suffix,
			});
		}
		if (Object.keys(patch).length === 1) return json({ error: "bad_request", message: "No supported fields were provided" }, 400, { "Cache-Control": "no-store" });
		const { data, error } = await getSupabaseAdmin().from("workspace_private_models").update(patch)
			.eq("workspace_id", auth.workspaceId).eq("id", id).select(SAFE_COLUMNS).maybeSingle();
		if (error || !data) throw error ?? new Error("Private model was not updated");
		await audit(auth, "private_model.updated", data as any, { changedFields: Object.keys(patch).filter((key) => !key.startsWith("enc_") && key !== "fingerprint_sha256") });
		return json({ data: formatPrivateModel(data as any) }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return inputError(error) ?? internalServerError("private_models.update", error); }
}

async function handleDelete(req: Request) {
	const authorized = await authorize(req, CAPABILITIES.PRIVATE_MODELS_DELETE);
	if (authorized.response) return authorized.response;
	const auth = authorized.auth!;
	const id = parsePathId(new URL(req.url), "private-models");
	if (!id || !UUID_PATTERN.test(id)) return json({ error: "bad_request", message: "A valid private model id is required" }, 400, { "Cache-Control": "no-store" });
	try {
		const existing = await findPrivateModel(auth.workspaceId, id);
		if (!existing) return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
		const { error } = await getSupabaseAdmin().from("workspace_private_models").delete().eq("workspace_id", auth.workspaceId).eq("id", id);
		if (error) throw error;
		await audit(auth, "private_model.deleted", existing);
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error) { return internalServerError("private_models.delete", error); }
}

export const privateModelsRoutes = new Hono<Env>();
privateModelsRoutes.get("/", withRuntime(handleList));
privateModelsRoutes.post("/", withRuntime(handleCreate));
privateModelsRoutes.get("/:id", withRuntime(handleGet));
privateModelsRoutes.patch("/:id", withRuntime(handleUpdate));
privateModelsRoutes.delete("/:id", withRuntime(handleDelete));
