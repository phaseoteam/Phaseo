import { Hono } from "hono";
import { invalidateWorkspaceGatewayContext } from "./gateway-invalidation";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import { encryptByokSecret } from "./settings-byok";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { requestAwareAvatarUrl } from "./settings-profile-avatar";

export const accountPrivateModelsRouter = new Hono<{ Bindings: Env }>();

const MODEL_SLUG = /^[a-z0-9][a-z0-9._:-]{0,126}$/;
// Never expose both fragments: together they reconstruct short credentials.
const SAFE_COLUMNS = "id,model_id,local_slug,catalog_model_id,host_provider_id,custom_provider_name,custom_provider_url,routing_policy,name,description,base_url,upstream_model_id,supports_responses,enabled,input_modalities,output_modalities,context_length,max_output_tokens,credential_suffix,created_at,updated_at";

async function resolveModelIdentity(client: any, workspaceSlug: string, reference: unknown) {
	const value = String(reference ?? "").trim().toLowerCase();
	if (value.includes("/")) {
		const result = await client.from("models").select("model_id,name").eq("model_id", value).maybeSingle();
		if (result.error || !result.data) throw new Error("Select an existing catalogue model or enter a short model slug.");
		return { model_id: value, catalog_model_id: value, local_slug: value.split("/").at(-1) };
	}
	if (!MODEL_SLUG.test(value)) throw new Error("Model slug contains unsupported characters.");
	const matches = await client.from("models").select("model_id,name").like("model_id", `%/${value}`).limit(2);
	if (!matches.error && matches.data?.length === 1) return { model_id: matches.data[0].model_id, catalog_model_id: matches.data[0].model_id, local_slug: value };
	return { model_id: `${workspaceSlug.toLowerCase()}/${value}`, catalog_model_id: null, local_slug: value };
}

function validateInput(body: Record<string, any>, workspaceId: string, partial = false) {
	const value: Record<string, any> = {};
	if (body.model_id !== undefined) throw new Error("Model ID is assigned by Phaseo.");
	if (!partial || body.slug !== undefined) {
		const slug = String(body.slug ?? "").trim().toLowerCase();
		if (!MODEL_SLUG.test(slug)) throw new Error("Model slug contains unsupported characters.");
		value.model_id = `${workspaceId.toLowerCase()}/${slug}`;
	}
	for (const [field, max] of [["name", 120], ["upstream_model_id", 255]] as const) if (!partial || body[field] !== undefined) {
		const text = String(body[field] ?? "").trim();
		if (!text || text.length > max) throw new Error(`${field} is required.`);
		value[field] = text;
	}
	if (!partial || body.base_url !== undefined) {
		const url = new URL(String(body.base_url ?? "").trim());
		const host = url.hostname.toLowerCase();
		if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+(?:\.\d+){3}$/.test(host)) throw new Error("Base URL must use a public HTTPS hostname.");
		if (/\/(?:chat\/completions|responses)\/?$/i.test(url.pathname)) throw new Error("Base URL must stop before the inference endpoint path.");
		value.base_url = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
	}
	if (body.description !== undefined) value.description = String(body.description ?? "").trim() || null;
	if (body.host_provider_id !== undefined || body.custom_provider_name !== undefined) {
		value.host_provider_id = String(body.host_provider_id ?? "").trim() || null;
		value.custom_provider_name = value.host_provider_id ? null : String(body.custom_provider_name ?? "").trim() || "Private endpoint";
		value.custom_provider_url = value.host_provider_id ? null : String(body.custom_provider_url ?? "").trim() || null;
	}
	if (body.routing_policy !== undefined) {
		if (!["preferred", "balanced", "fallback"].includes(body.routing_policy)) throw new Error("Routing policy is invalid.");
		value.routing_policy = body.routing_policy;
	}
	for (const field of ["supports_responses", "enabled"] as const) if (body[field] !== undefined) value[field] = body[field] === true;
	for (const field of ["context_length", "max_output_tokens"] as const) if (body[field] !== undefined) {
		const number = body[field] === null || body[field] === "" ? null : Number(body[field]);
		if (number !== null && (!Number.isSafeInteger(number) || number <= 0)) throw new Error(`${field} must be a positive integer.`);
		value[field] = number;
	}
	return value;
}

function admin(context: Awaited<ReturnType<typeof requireAccountWorkspace>>) {
	return Boolean(context && ["owner", "admin"].includes(context.role.toLowerCase()));
}

accountPrivateModelsRouter.get("/", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_private_models").select(SAFE_COLUMNS).eq("workspace_id", context.workspaceId).order("name");
	if (result.error) return c.json({ error: "private_models_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ workspaceId: context.workspaceId, workspaceNamespace: context.workspaceSlug, workspaceName: context.workspaceName, workspaceLogoUrl: requestAwareAvatarUrl(c.env, c.req.raw, context.workspaceLogoUrl), canManage: admin(context), models: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountPrivateModelsRouter.post("/", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!admin(context)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const body = await c.req.json<Record<string, any>>();
		const id = crypto.randomUUID();
		const credential = String(body.credential ?? "").trim();
		if (credential.length < 8 || /\s/.test(credential)) throw new Error("Credential must contain at least 8 characters without spaces.");
		const providerId = `private-model:${id}`;
		const encrypted = await encryptByokSecret(c.env, credential, { workspaceId: context!.workspaceId, providerId });
		const { prefix, suffix, ...encryptedFields } = encrypted;
		const identity = await resolveModelIdentity(context!.client, context!.workspaceSlug, body.model_reference ?? body.slug);
		const result = await context!.client.from("workspace_private_models").insert({
			id, workspace_id: context!.workspaceId, provider_id: providerId, created_by: context!.user.id,
			...validateInput({ ...body, slug: identity.local_slug }, context!.workspaceSlug), ...identity, ...encryptedFields, credential_prefix: prefix, credential_suffix: suffix,
			host_provider_id: String(body.host_provider_id ?? "").trim() || null,
			custom_provider_name: String(body.host_provider_id ?? "").trim() ? null : String(body.custom_provider_name ?? "").trim() || "Private endpoint",
			routing_policy: body.routing_policy ?? "preferred",
		}).select(SAFE_COLUMNS).single();
		if (result.error) throw result.error;
		await recordWorkspaceAuditEvent(context!.client, { workspaceId: context!.workspaceId, actorUserId: context!.user.id, action: "private_model.created", targetType: "private_model", targetId: id, targetName: String(result.data?.name ?? "") });
		const gatewayCacheInvalidated = await invalidateWorkspaceGatewayContext(context!, c.env).catch(() => false);
		return c.json({ model: result.data, gatewayCacheInvalidated }, 201, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "Private model could not be created." }, 400, PRIVATE_NO_STORE_HEADERS); }
});

accountPrivateModelsRouter.patch("/:id", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!admin(context)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const body = await c.req.json<Record<string, any>>();
		const update = validateInput(body, context!.workspaceSlug, true);
		if (body.model_reference !== undefined) Object.assign(update, await resolveModelIdentity(context!.client, context!.workspaceSlug, body.model_reference));
		if (body.credential !== undefined && String(body.credential).trim()) {
			const credential = String(body.credential).trim();
			if (credential.length < 8 || /\s/.test(credential)) throw new Error("Credential must contain at least 8 characters without spaces.");
			const providerId = `private-model:${c.req.param("id")}`;
			const encrypted = await encryptByokSecret(c.env, credential, { workspaceId: context!.workspaceId, providerId });
			const { prefix, suffix, ...encryptedFields } = encrypted;
			Object.assign(update, encryptedFields, { credential_prefix: prefix, credential_suffix: suffix });
		}
		update.updated_at = new Date().toISOString();
		const result = await context!.client.from("workspace_private_models").update(update).eq("workspace_id", context!.workspaceId).eq("id", c.req.param("id")).select(SAFE_COLUMNS).maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		await recordWorkspaceAuditEvent(context!.client, { workspaceId: context!.workspaceId, actorUserId: context!.user.id, action: "private_model.updated", targetType: "private_model", targetId: c.req.param("id"), targetName: String(result.data.name ?? ""), metadata: { changedFields: Object.keys(update).filter((field) => !field.startsWith("enc_") && field !== "fingerprint_sha256") } });
		const gatewayCacheInvalidated = await invalidateWorkspaceGatewayContext(context!, c.env).catch(() => false);
		return c.json({ model: result.data, gatewayCacheInvalidated }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "Private model could not be updated." }, 400, PRIVATE_NO_STORE_HEADERS); }
});

accountPrivateModelsRouter.delete("/:id", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!admin(context)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const existing = await context!.client.from("workspace_private_models").select("name").eq("workspace_id", context!.workspaceId).eq("id", c.req.param("id")).maybeSingle();
	if (existing.error || !existing.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const result = await context!.client.from("workspace_private_models").delete().eq("workspace_id", context!.workspaceId).eq("id", c.req.param("id"));
	if (result.error) return c.json({ error: "private_model_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	await recordWorkspaceAuditEvent(context!.client, { workspaceId: context!.workspaceId, actorUserId: context!.user.id, action: "private_model.deleted", targetType: "private_model", targetId: c.req.param("id"), targetName: String(existing.data.name ?? "") });
	const gatewayCacheInvalidated = await invalidateWorkspaceGatewayContext(context!, c.env).catch(() => false);
	return c.json({ deleted: true, gatewayCacheInvalidated }, 200, PRIVATE_NO_STORE_HEADERS);
});

function pageModel(row: Record<string, any>, workspace: { slug: string; name: string; logoUrl: string | null }) {
	const endpoints = row.supports_responses === true
		? ["chat.completions", "messages", "responses"]
		: ["chat.completions", "messages"];
	return {
		model_id: row.model_id,
		base_model_id: row.model_id,
		variant_kind: null,
		variants: [],
		name: row.name,
		description: row.description ?? null,
		organisation_id: workspace.slug,
		organisation_name: workspace.name,
		organisation_logo_url: workspace.logoUrl,
		organisation_colour: null,
		status: "Active",
		deprecation_date: null,
		retirement_date: null,
		removal_date: null,
		primary_date: row.created_at ?? null,
		primary_timestamp: row.created_at ? Date.parse(row.created_at) : 0,
		primary_group_key: "Private models",
		gateway_status: "active",
		gateway_provider_count: 1,
		gateway_active_provider_count: 1,
		gateway_endpoints: endpoints,
		gateway_input_modalities: row.input_modalities ?? ["text"],
		gateway_output_modalities: row.output_modalities ?? ["text"],
		gateway_features: [],
		gateway_provider_names: ["Private endpoint"],
		gateway_active_provider_names: ["Private endpoint"],
		gateway_execution_regions: [],
		gateway_provider_details: [],
		gateway_api_model_ids: [row.model_id],
		context_lengths: row.context_length ? [row.context_length] : [],
		supported_parameters: [],
		gateway_tiers: ["private"],
		is_private: true,
	};
}

function tableModels(row: Record<string, any>) {
	const endpoints = row.supports_responses === true
		? ["chat.completions", "messages", "responses"]
		: ["chat.completions", "messages"];
	return endpoints.map((endpoint) => ({
		id: `private-model:${row.id}:${endpoint}`,
		model: row.name,
		modelId: row.model_id,
		organisationId: "private",
		organisationName: "Private",
		provider: { name: "Private endpoint", id: "private-model", inputPrice: 0, outputPrice: 0, features: [], executionRegions: [] },
		endpoint,
		gatewayStatus: "active",
		inputModalities: row.input_modalities ?? ["text"],
		outputModalities: row.output_modalities ?? ["text"],
		context: row.context_length ?? 0,
		maxOutput: row.max_output_tokens ?? 0,
		tier: "private",
		added: row.created_at ?? undefined,
		isPrivate: true,
	}));
}

accountPrivateModelsRouter.get("/catalog", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_private_models")
		.select("id,model_id,name,description,supports_responses,input_modalities,output_modalities,context_length,max_output_tokens,created_at")
		.eq("workspace_id", context.workspaceId).eq("enabled", true).order("name", { ascending: true });
	if (result.error) {
		console.error("[web-api/account] private model catalogue failed", { workspaceId: context.workspaceId, error: result.error });
		return c.json({ error: "private_model_catalogue_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const rows = (result.data ?? []) as Array<Record<string, any>>;
	const shape = c.req.query("shape") === "table" ? "table" : "page";
	return c.json({ private_catalogue: true, models: shape === "table" ? rows.flatMap(tableModels) : rows.map((row) => pageModel(row, { slug: context.workspaceSlug, name: context.workspaceName, logoUrl: requestAwareAvatarUrl(c.env, c.req.raw, context.workspaceLogoUrl) })) }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountPrivateModelsRouter.get("/performance", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const modelId = String(c.req.query("modelId") ?? "").trim().toLowerCase();
	const owned = await context.client.from("workspace_private_models").select("id").eq("workspace_id", context.workspaceId).eq("model_id", modelId).limit(1);
	if (owned.error || !owned.data?.length) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
	const result = await context.client.from("v2_request_facts").select("success,latency_ms,generation_ms,throughput,occurred_at")
		.eq("workspace_id", context.workspaceId).gte("occurred_at", since)
		.or(`requested_model_input.eq.${modelId},requested_model_slug.eq.${modelId},routed_model_slug.eq.${modelId}`).limit(10_000);
	if (result.error) return c.json({ error: "private_model_performance_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const rows = result.data ?? []; const successful = rows.filter((row) => row.success === true);
	const average = (field: "latency_ms" | "generation_ms" | "throughput") => { const values = successful.map((row) => Number(row[field])).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
	return c.json({ modelId, requests: rows.length, successfulRequests: successful.length, successRate: rows.length ? successful.length / rows.length * 100 : null, averageLatencyMs: average("latency_ms"), averageGenerationMs: average("generation_ms"), averageThroughput: average("throughput"), lastRequestAt: rows.map((row) => row.occurred_at).filter(Boolean).sort().at(-1) ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
});
