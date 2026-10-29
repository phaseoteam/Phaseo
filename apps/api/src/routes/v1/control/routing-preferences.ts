// Auto-routing limits and successor model replacements: the API side of
// Settings → Routing. Validation is the dashboard's own
// (@core/workspace-routing-settings, generated from packages/shared), and the
// same roles apply: any member can read, owners and admins can change.
// Successor routing's on/off switch and price policy live in /v1/settings.
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";
import {
	AUTO_ROUTING_COLUMNS,
	MAX_SUCCESSOR_REPLACEMENTS,
	autoRoutingFromRow,
	parseAutoRoutingUpdate,
	parseSuccessorReplacement,
	successorModelSlug,
	successorReplacementCatalogueError,
	type AutoRouting,
} from "@core/workspace-routing-settings";
import {
	internalServerError,
	isResponse,
	rejectThirdPartyOAuthSpendingChange,
	requireCapability,
	requireJsonBody,
	requireOAuthWorkspaceRole,
} from "./route-helpers";
import { invalidateWorkspaceGatewayContextCache } from "./settings";

const NO_STORE = { "Cache-Control": "no-store" };

type ManagementAuth = Extract<Awaited<ReturnType<typeof guardManagementAuth>>, { ok: true }>["value"];

async function authorize(req: Request, scope: string, roles: string[]): Promise<{ auth: ManagementAuth } | { response: Response }> {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const scopeError = requireCapability(auth.value, scope);
	if (scopeError) return { response: scopeError };
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, roles);
	if (roleError) return { response: roleError };
	return { auth: auth.value };
}

function formatAutoRouting(value: AutoRouting) {
	return {
		allowed_patterns: value.allowedPatterns,
		spend_profile: value.spendProfile,
		max_input_price_per_million: value.maxInputPricePerMillion,
		max_output_price_per_million: value.maxOutputPricePerMillion,
		objective: value.objective,
		allow_fallbacks: value.allowFallbacks,
		revision: value.revision,
		updated_at: value.updatedAt,
	};
}

// The API takes snake_case like the rest of /v1; the dashboard's camelCase names are accepted too.
const AUTO_ROUTING_FIELDS: Record<string, keyof AutoRouting> = {
	allowed_patterns: "allowedPatterns",
	spend_profile: "spendProfile",
	max_input_price_per_million: "maxInputPricePerMillion",
	max_output_price_per_million: "maxOutputPricePerMillion",
	objective: "objective",
	allow_fallbacks: "allowFallbacks",
};

// The spend profile and its price ceilings limit what auto-routing may spend, so apps can't change them.
const PRICE_LIMIT_FIELDS = new Set<string>(["spendProfile", "maxInputPricePerMillion", "maxOutputPricePerMillion"]);

async function readAutoRoutingRow(workspaceId: string) {
	const { data, error } = await getSupabaseAdmin().from("workspace_settings")
		.select(AUTO_ROUTING_COLUMNS).eq("workspace_id", workspaceId).maybeSingle();
	if (error) throw new Error(error.message || "Failed to read auto-routing settings");
	return data;
}

export async function handleGetAutoRouting(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_READ, ["owner", "admin", "member"]);
	if ("response" in access) return access.response;
	try {
		const row = await readAutoRoutingRow(access.auth.workspaceId);
		return json({ data: formatAutoRouting(autoRoutingFromRow(row)) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("routing.auto.get", error);
	}
}

/** Changes only the fields sent; the result is validated as a whole, as the settings page saves it. */
export async function handleUpdateAutoRouting(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if ("response" in access) return access.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const changes: Record<string, unknown> = {};
	for (const [snake, camel] of Object.entries(AUTO_ROUTING_FIELDS)) {
		if (body[snake] !== undefined) changes[camel] = body[snake];
		else if (body[camel] !== undefined) changes[camel] = body[camel];
	}
	if (Object.keys(changes).length === 0) {
		return json({ error: "bad_request", message: `Send at least one of: ${Object.keys(AUTO_ROUTING_FIELDS).join(", ")}` }, 400, NO_STORE);
	}
	if (Object.keys(changes).some((field) => PRICE_LIMIT_FIELDS.has(field))) {
		const appError = rejectThirdPartyOAuthSpendingChange(access.auth, "Apps that use Sign in with Phaseo can't change auto-routing's spend profile or price limits. The person can change them under Settings, Routing.");
		if (appError) return appError;
	}
	const { workspaceId } = access.auth;
	try {
		const current = autoRoutingFromRow(await readAutoRoutingRow(workspaceId));
		const update = parseAutoRoutingUpdate({ ...current, ...changes });
		if (update.ok === false) return json({ ...update.error, message: autoRoutingErrorMessage(update.error.error) }, 400, NO_STORE);
		const { data, error } = await getSupabaseAdmin().from("workspace_settings")
			.upsert({ workspace_id: workspaceId, ...update.value }, { onConflict: "workspace_id" })
			.select(AUTO_ROUTING_COLUMNS).maybeSingle();
		if (error) throw new Error(error.message || "Failed to update auto-routing settings");
		await invalidateWorkspaceGatewayContextCache(workspaceId);
		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId,
			actorUserId: access.auth.userId,
			action: "routing.auto.updated",
			targetType: "workspace_routing_policy",
			targetId: workspaceId,
			metadata: { changed_fields: Object.keys(changes) },
			requestId: access.auth.requestId,
		});
		return json({ data: formatAutoRouting(autoRoutingFromRow(data ?? update.value)) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("routing.auto.update", error);
	}
}

function autoRoutingErrorMessage(code: string): string {
	switch (code) {
		case "invalid_model_patterns": return "allowed_patterns takes at most 16 provider/model patterns, such as openai/* or anthropic/claude-*";
		case "invalid_objective": return "objective must be balanced, quality, cost, or latency";
		case "invalid_spend_profile": return "spend_profile must be economy, standard, premium, unrestricted, or custom";
		default: return "A custom spend_profile needs max_input_price_per_million and max_output_price_per_million";
	}
}

const REPLACEMENT_MESSAGES: Record<string, string> = {
	invalid_model: "model must be a model id",
	invalid_successor: "successor must be a model id, or null to never redirect the model",
	successor_is_model: "successor must differ from model",
	unknown_model: "model is not in the catalogue",
	unknown_successor: "successor is not in the catalogue",
	inactive_successor: "successor is not served, so requests would never be redirected to it",
};

function formatReplacement(row: { model_slug: string; successor_model_slug: string | null; updated_at?: string | null }) {
	return { model: String(row.model_slug), successor: row.successor_model_slug ?? null, updated_at: row.updated_at ?? null };
}

export async function handleListSuccessorReplacements(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_READ, ["owner", "admin", "member"]);
	if ("response" in access) return access.response;
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_model_successor_overrides")
			.select("model_slug,successor_model_slug,updated_at")
			.eq("workspace_id", access.auth.workspaceId)
			.order("model_slug")
			.limit(MAX_SUCCESSOR_REPLACEMENTS);
		if (error) throw new Error(error.message || "Failed to list successor replacements");
		return json({ data: (data ?? []).map(formatReplacement) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("routing.successor.replacements.list", error);
	}
}

/** Saves the model's replacement (successor null: never redirect it), replacing any earlier one. */
export async function handleSaveSuccessorReplacement(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if ("response" in access) return access.response;
	// The workspace's own replacement ignores the successor price policy, which apps can't change either.
	const appError = rejectThirdPartyOAuthSpendingChange(access.auth, "Apps that use Sign in with Phaseo can't save successor replacements, since a replacement ignores the successor price policy. The person can save them under Settings, Routing.");
	if (appError) return appError;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	if (!("successor" in body)) return json({ error: "invalid_successor", message: REPLACEMENT_MESSAGES.invalid_successor }, 400, NO_STORE);
	const parsed = parseSuccessorReplacement(body);
	if (parsed.ok === false) return json({ error: parsed.error, message: REPLACEMENT_MESSAGES[parsed.error] }, 400, NO_STORE);
	const { model, successor } = parsed.value;
	const { workspaceId } = access.auth;
	try {
		const client = getSupabaseAdmin();
		const models = await client.from("v2_models").select("model_slug,status")
			.in("model_slug", successor ? [model, successor] : [model]).eq("hidden", false);
		if (models.error) throw new Error(models.error.message || "Failed to read models");
		const statuses = new Map((models.data ?? []).map((row: any) => [String(row.model_slug), String(row.status ?? "")]));
		const catalogueError = successorReplacementCatalogueError(parsed.value, statuses);
		if (catalogueError) return json({ error: catalogueError, message: REPLACEMENT_MESSAGES[catalogueError] }, 400, NO_STORE);
		const existing = await client.from("workspace_model_successor_overrides")
			.select("model_slug", { count: "exact", head: true }).eq("workspace_id", workspaceId);
		if (existing.error) throw new Error(existing.error.message || "Failed to count successor replacements");
		if ((existing.count ?? 0) >= MAX_SUCCESSOR_REPLACEMENTS) {
			const current = await client.from("workspace_model_successor_overrides").select("model_slug")
				.eq("workspace_id", workspaceId).eq("model_slug", model).maybeSingle();
			if (current.error) throw new Error(current.error.message || "Failed to read successor replacement");
			if (!current.data) {
				return json({ error: "too_many_replacements", maximum: MAX_SUCCESSOR_REPLACEMENTS, message: `A workspace can keep at most ${MAX_SUCCESSOR_REPLACEMENTS} replacements` }, 400, NO_STORE);
			}
		}
		const { data, error } = await client.from("workspace_model_successor_overrides").upsert({
			workspace_id: workspaceId,
			model_slug: model,
			successor_model_slug: successor,
			created_by: access.auth.userId ?? null,
			updated_at: new Date().toISOString(),
		}, { onConflict: "workspace_id,model_slug" }).select("model_slug,successor_model_slug,updated_at").maybeSingle();
		if (error) throw new Error(error.message || "Failed to save successor replacement");
		await recordWorkspaceAuditEvent(client, {
			workspaceId,
			actorUserId: access.auth.userId,
			action: "routing.successor_replacement.saved",
			targetType: "workspace_model_successor_override",
			targetId: model,
			targetName: model,
			metadata: { successor },
			requestId: access.auth.requestId,
		});
		return json({ data: formatReplacement(data ?? { model_slug: model, successor_model_slug: successor }) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("routing.successor.replacements.save", error);
	}
}

/** Model ids contain slashes, so the model is a query parameter rather than a path segment. */
export async function handleRemoveSuccessorReplacement(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE, ["owner", "admin"]);
	if ("response" in access) return access.response;
	const model = successorModelSlug(new URL(req.url).searchParams.get("model"));
	if (!model) return json({ error: "invalid_model", message: "Pass the model id as ?model=" }, 400, NO_STORE);
	const { workspaceId } = access.auth;
	try {
		const client = getSupabaseAdmin();
		const { data, error } = await client.from("workspace_model_successor_overrides").delete()
			.eq("workspace_id", workspaceId).eq("model_slug", model).select("model_slug");
		if (error) throw new Error(error.message || "Failed to remove successor replacement");
		if (!data?.length) return json({ error: "not_found", message: "No replacement is saved for this model" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(client, {
			workspaceId,
			actorUserId: access.auth.userId,
			action: "routing.successor_replacement.removed",
			targetType: "workspace_model_successor_override",
			targetId: model,
			targetName: model,
			requestId: access.auth.requestId,
		});
		return json({ deleted: true, model }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("routing.successor.replacements.remove", error);
	}
}
