"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
	revalidateBenchmarkDataTags,
	revalidateModelApiInfoTags,
	revalidateModelDataOnlyTags,
	revalidateModelDataTags,
} from "@/lib/cache/revalidateDataTags";
import {
	getIndexNowModelUrls,
	getIndexNowProviderUrls,
	submitIndexNowUrls,
} from "@/lib/indexnow";
import { updateModel } from "@/app/(dashboard)/models/actions";
import { normalizeProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";
import {
	normalizeProviderDataPolicyConfidence,
	normalizeProviderDataPolicyContractMode,
	normalizeProviderDataPolicyTier,
} from "@/lib/providers/dataPolicy";
import {
	MODEL_MODALITY_OPTIONS,
	normalizeCapabilityStatus,
	normalizeModelStatus,
	type CapabilityStatusOption,
} from "@/lib/models/editorOptions";
import { normalizeHttpUrl } from "@/lib/utils/urlSafety";

async function requireAdmin() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("Unauthorized");

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		throw new Error("Unauthorized");
	}

	return supabase;
}

function optionalString(v: FormDataEntryValue | null) {
	if (typeof v !== "string") return null;
	const trimmed = v.trim();
	return trimmed.length ? trimmed : null;
}

const CORE_TYPE_OPTIONS = MODEL_MODALITY_OPTIONS;
const MODEL_DETAIL_NAME_OPTIONS = [
	"input_context_length",
	"output_context_length",
	"knowledge_cutoff",
	"parameter_count",
	"training_tokens",
] as const;
const NUMERIC_ONLY_DETAIL_NAME_OPTIONS = ["parameter_count", "training_tokens"] as const;

function normalizeCoreTypes(value: FormDataEntryValue | null): string | null {
	if (typeof value !== "string") return null;
	const selected = new Set(
		value
			.split(",")
			.map((item) => item.trim().toLowerCase())
			.filter((item): item is (typeof CORE_TYPE_OPTIONS)[number] =>
				CORE_TYPE_OPTIONS.includes(item as (typeof CORE_TYPE_OPTIONS)[number]),
			),
	);
	const normalized = CORE_TYPE_OPTIONS.filter((type) => selected.has(type));
	return normalized.length ? normalized.join(",") : null;
}

function normalizeModelDetailName(input: unknown): (typeof MODEL_DETAIL_NAME_OPTIONS)[number] | null {
	if (typeof input !== "string") return null;
	const value = input.trim().toLowerCase();
	if (!value) return null;
	return MODEL_DETAIL_NAME_OPTIONS.includes(value as (typeof MODEL_DETAIL_NAME_OPTIONS)[number])
		? (value as (typeof MODEL_DETAIL_NAME_OPTIONS)[number])
		: null;
}

function normalizeModelLinkKind(input: unknown): string | null {
	if (typeof input !== "string") return null;
	const value = input
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^a-z0-9_]+/g, "")
		.replace(/^_+|_+$/g, "");
	if (!value) return null;
	return value.slice(0, 80);
}

function titleForModelLinkKind(kind: string): string {
	switch (kind) {
		case "api_reference":
			return "API Reference";
		case "model_card":
			return "Model Card";
		default:
			return kind
				.replace(/[_-]+/g, " ")
				.replace(/\b\w/g, (char) => char.toUpperCase());
	}
}

function normalizeModelLinkTitle(input: unknown, kind: string): string {
	if (typeof input !== "string") return titleForModelLinkKind(kind);
	const title = input.trim();
	return title || titleForModelLinkKind(kind);
}

function normalizeModelDetailValue(
	detailName: (typeof MODEL_DETAIL_NAME_OPTIONS)[number],
	rawValue: unknown
): string | null {
	const value = typeof rawValue === "string" || typeof rawValue === "number"
		? String(rawValue).trim()
		: "";
	if (!value) return null;

	if (NUMERIC_ONLY_DETAIL_NAME_OPTIONS.includes(detailName as (typeof NUMERIC_ONLY_DETAIL_NAME_OPTIONS)[number])) {
		const digitsOnly = value.replace(/[^\d]/g, "");
		if (!digitsOnly) return null;
		return digitsOnly.replace(/^0+(?=\d)/, "");
	}

	return value;
}

function requiredString(v: FormDataEntryValue | null, field: string) {
	const parsed = optionalString(v);
	if (!parsed) throw new Error(`${field} is required`);
	return parsed;
}

function parseJsonField<T>(value: FormDataEntryValue | null, field: string, fallback: T): T {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	try {
		return JSON.parse(trimmed) as T;
	} catch {
		throw new Error(`Invalid ${field} payload`);
	}
}

function slugifyId(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function inferOrganisationIdFromApiModelId(modelId: string): string | null {
	const [provider] = modelId.split("/");
	const normalized = provider?.trim().toLowerCase();
	return normalized ? normalized : null;
}

const ORG_SOCIAL_PLATFORM_ORDER = [
	"discord",
	"github",
	"hugging_face",
	"instagram",
	"linkedin",
	"reddit",
	"threads",
	"tiktok",
	"website",
	"x",
	"youtube",
] as const;

function getOrganisationPlatformAlias(
	value: string,
): (typeof ORG_SOCIAL_PLATFORM_ORDER)[number] | null {
	switch (value) {
		case "dicsord":
			return "discord";
		case "twitter":
			return "x";
		case "web":
		case "site":
			return "website";
		default:
			return null;
	}
}

function normalizeOrganisationPlatform(input: unknown): (typeof ORG_SOCIAL_PLATFORM_ORDER)[number] | null {
	if (typeof input !== "string") return null;
	const value = input.trim().toLowerCase();
	if (!value) return null;
	const canonical = getOrganisationPlatformAlias(value) ?? value;
	return ORG_SOCIAL_PLATFORM_ORDER.includes(canonical as any)
		? (canonical as (typeof ORG_SOCIAL_PLATFORM_ORDER)[number])
		: null;
}

type OrganisationLinkPayload = {
	platform?: string | null;
	url?: string | null;
};

async function replaceOrganisationLinks(
	supabase: Awaited<ReturnType<typeof requireAdmin>>,
	organisationId: string,
	rawLinks: OrganisationLinkPayload[]
) {
	const rank = new Map(ORG_SOCIAL_PLATFORM_ORDER.map((platform, index) => [platform, index]));
	const links = rawLinks
		.map((link) => ({
			platform: normalizeOrganisationPlatform(link.platform),
			url: normalizeHttpUrl(link.url),
		}))
		.filter((link): link is { platform: (typeof ORG_SOCIAL_PLATFORM_ORDER)[number]; url: string } => Boolean(link.platform && link.url))
		.sort((a, b) => {
			const rankA = rank.get(a.platform) ?? Number.MAX_SAFE_INTEGER;
			const rankB = rank.get(b.platform) ?? Number.MAX_SAFE_INTEGER;
			if (rankA !== rankB) return rankA - rankB;
			return a.url.localeCompare(b.url);
		});

	const uniquePlatforms = new Set(links.map((link) => link.platform));
	if (uniquePlatforms.size !== links.length) {
		throw new Error("Duplicate organisation social platforms are not allowed");
	}

	const { error: deleteError } = await supabase
		.from("data_organisation_links")
		.delete()
		.eq("organisation_id", organisationId);
	if (deleteError) throw new Error(deleteError.message);

	if (!links.length) return;
	const { error: insertError } = await supabase
		.from("data_organisation_links")
		.insert(
			links.map((link) => ({
				organisation_id: organisationId,
				platform: link.platform,
				url: link.url,
			}))
		);
	if (insertError) throw new Error(insertError.message);
}

type ProviderPair = { provider_id: string; api_model_id: string };

function dedupeProviderPairs(pairs: ProviderPair[]): ProviderPair[] {
	const unique = new Map<string, ProviderPair>();
	for (const pair of pairs) {
		const providerId = pair.provider_id?.trim();
		const apiModelId = pair.api_model_id?.trim();
		if (!providerId || !apiModelId) continue;
		unique.set(`${providerId}:::${apiModelId}`, {
			provider_id: providerId,
			api_model_id: apiModelId,
		});
	}
	return Array.from(unique.values());
}

async function deletePricingRulesForProviderPairs(
	supabase: Awaited<ReturnType<typeof requireAdmin>>,
	pairs: ProviderPair[]
) {
	for (const pair of dedupeProviderPairs(pairs)) {
		const modelKeyPrefix = `${pair.provider_id}:${pair.api_model_id}:`;
		const { error } = await supabase
			.from("data_api_pricing_rules")
			.delete()
			.gte("model_key", modelKeyPrefix)
			.lt("model_key", `${modelKeyPrefix}\uffff`);
		if (error) throw new Error(error.message);
	}
}

async function deleteModelGraph(
	supabase: Awaited<ReturnType<typeof requireAdmin>>,
	modelId: string
) {
	const { data: providerModelRows, error: providerRowsError } = await supabase
		.from("data_api_provider_models")
		.select("provider_api_model_id, provider_id, api_model_id")
		.eq("model_id", modelId);
	if (providerRowsError) throw new Error(providerRowsError.message);

	const providerApiModelIds = (providerModelRows ?? [])
		.map((row) => row.provider_api_model_id)
		.filter(Boolean);
	if (providerApiModelIds.length > 0) {
		const { error: capabilitiesDeleteError } = await supabase
			.from("data_api_provider_model_capabilities")
			.delete()
			.in("provider_api_model_id", providerApiModelIds);
		if (capabilitiesDeleteError) throw new Error(capabilitiesDeleteError.message);
	}

	await deletePricingRulesForProviderPairs(
		supabase,
		(providerModelRows ?? []).map((row) => ({
			provider_id: row.provider_id,
			api_model_id: row.api_model_id,
		}))
	);

	const { error: providerModelsDeleteError } = await supabase
		.from("data_api_provider_models")
		.delete()
		.eq("model_id", modelId);
	if (providerModelsDeleteError) throw new Error(providerModelsDeleteError.message);

	const { error: aliasesDeleteError } = await supabase
		.from("data_api_model_aliases")
		.delete()
		.eq("api_model_id", modelId);
	if (aliasesDeleteError) throw new Error(aliasesDeleteError.message);

	const { error: benchmarkDeleteError } = await supabase
		.from("data_benchmark_results")
		.delete()
		.eq("model_id", modelId);
	if (benchmarkDeleteError) throw new Error(benchmarkDeleteError.message);

	const { error: detailsDeleteError } = await supabase
		.from("data_model_details")
		.delete()
		.eq("model_id", modelId);
	if (detailsDeleteError) throw new Error(detailsDeleteError.message);

	const { error: linksDeleteError } = await supabase
		.from("data_model_links")
		.delete()
		.eq("model_id", modelId);
	if (linksDeleteError) throw new Error(linksDeleteError.message);

	const { error: planModelsDeleteError } = await supabase
		.from("data_subscription_plan_models")
		.delete()
		.eq("model_id", modelId);
	if (planModelsDeleteError) throw new Error(planModelsDeleteError.message);

	const { error: modelDeleteError } = await supabase
		.from("data_models")
		.delete()
		.eq("model_id", modelId);
	if (modelDeleteError) throw new Error(modelDeleteError.message);

	const { error: apiModelDeleteError } = await supabase
		.from("data_api_models")
		.delete()
		.eq("api_model_id", modelId);
	if (apiModelDeleteError) throw new Error(apiModelDeleteError.message);
}

// react-doctor-disable-next-line
export async function createOrganisationAction(formData: FormData) {
	const supabase = await requireAdmin();
	const organisationId = requiredString(formData.get("organisation_id"), "organisation_id");
	const name = requiredString(formData.get("name"), "name");
	const socialLinks = parseJsonField<OrganisationLinkPayload[]>(formData.get("social_links_payload"), "social_links_payload", []);

	const { error } = await supabase.from("data_organisations").insert({
		organisation_id: organisationId,
		name,
		description: optionalString(formData.get("description")),
		country_code: optionalString(formData.get("country_code")),
		colour: optionalString(formData.get("colour")),
	});
	if (error) throw new Error(error.message);
	await replaceOrganisationLinks(supabase, organisationId, socialLinks);

	revalidateModelDataTags({ organisationIds: [organisationId] });
	revalidatePath("/internal/data/organisations");
}

// react-doctor-disable-next-line
export async function updateOrganisationAction(organisationId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const socialLinks = parseJsonField<OrganisationLinkPayload[]>(formData.get("social_links_payload"), "social_links_payload", []);
	const { error } = await supabase
		.from("data_organisations")
		.update({
			name: requiredString(formData.get("name"), "name"),
			description: optionalString(formData.get("description")),
			country_code: optionalString(formData.get("country_code")),
			colour: optionalString(formData.get("colour")),
			updated_at: new Date().toISOString(),
		})
		.eq("organisation_id", organisationId);
	if (error) throw new Error(error.message);
	await replaceOrganisationLinks(supabase, organisationId, socialLinks);

	revalidateModelDataTags({ organisationIds: [organisationId] });
	revalidatePath("/internal/data/organisations");
}

// react-doctor-disable-next-line
export async function deleteOrganisationAction(organisationId: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase
		.from("data_organisations")
		.delete()
		.eq("organisation_id", organisationId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ organisationIds: [organisationId] });
	revalidatePath("/internal/data/organisations");
}

// react-doctor-disable-next-line
export async function createAPIProviderAction(formData: FormData) {
	const supabase = await requireAdmin();
	const apiProviderId = requiredString(formData.get("api_provider_id"), "api_provider_id");
	const apiProviderName = requiredString(formData.get("api_provider_name"), "api_provider_name");
	const promptTrainingPolicy = normalizeProviderPromptTrainingPolicy(
		formData.get("prompt_training_policy"),
	);
	const dataPolicyTier = normalizeProviderDataPolicyTier(
		formData.get("data_policy_tier"),
	);
	const dataPolicyConfidence = normalizeProviderDataPolicyConfidence(
		formData.get("data_policy_confidence"),
	);
	const dataPolicyContractMode = normalizeProviderDataPolicyContractMode(
		formData.get("data_policy_contract_mode"),
	);

	const { error } = await supabase.from("data_api_providers").insert({
		api_provider_id: apiProviderId,
		api_provider_name: apiProviderName,
		description: optionalString(formData.get("description")),
		link: optionalString(formData.get("link")),
		country_code: optionalString(formData.get("country_code")),
		prompt_training_policy: promptTrainingPolicy,
		prompt_training_notes: optionalString(formData.get("prompt_training_notes")),
		prompt_training_source_url: optionalString(formData.get("prompt_training_source_url")),
		data_policy_tier: dataPolicyTier,
		data_policy_confidence: dataPolicyConfidence,
		data_policy_contract_mode: dataPolicyContractMode,
		data_policy_contract_notes: optionalString(
			formData.get("data_policy_contract_notes"),
		),
		status: "Active",
	});
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	await submitIndexNowUrls(
		getIndexNowProviderUrls(apiProviderId),
		`create provider ${apiProviderId}`,
	);
	revalidatePath("/internal/data/api-providers");
}

// react-doctor-disable-next-line
export async function updateAPIProviderAction(apiProviderId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const promptTrainingPolicy = normalizeProviderPromptTrainingPolicy(
		formData.get("prompt_training_policy"),
	);
	const dataPolicyTier = normalizeProviderDataPolicyTier(
		formData.get("data_policy_tier"),
	);
	const dataPolicyConfidence = normalizeProviderDataPolicyConfidence(
		formData.get("data_policy_confidence"),
	);
	const dataPolicyContractMode = normalizeProviderDataPolicyContractMode(
		formData.get("data_policy_contract_mode"),
	);
	const { error } = await supabase
		.from("data_api_providers")
		.update({
			api_provider_name: requiredString(formData.get("api_provider_name"), "api_provider_name"),
			description: optionalString(formData.get("description")),
			link: optionalString(formData.get("link")),
			country_code: optionalString(formData.get("country_code")),
			prompt_training_policy: promptTrainingPolicy,
			prompt_training_notes: optionalString(formData.get("prompt_training_notes")),
			prompt_training_source_url: optionalString(formData.get("prompt_training_source_url")),
			data_policy_tier: dataPolicyTier,
			data_policy_confidence: dataPolicyConfidence,
			data_policy_contract_mode: dataPolicyContractMode,
			data_policy_contract_notes: optionalString(
				formData.get("data_policy_contract_notes"),
			),
			updated_at: new Date().toISOString(),
		})
		.eq("api_provider_id", apiProviderId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	await submitIndexNowUrls(
		getIndexNowProviderUrls(apiProviderId),
		`update provider ${apiProviderId}`,
	);
	revalidatePath("/internal/data/api-providers");
}

// react-doctor-disable-next-line
export async function deleteAPIProviderAction(apiProviderId: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase
		.from("data_api_providers")
		.delete()
		.eq("api_provider_id", apiProviderId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	await submitIndexNowUrls(
		getIndexNowProviderUrls(apiProviderId),
		`delete provider ${apiProviderId}`,
	);
	revalidatePath("/internal/data/api-providers");
}

// react-doctor-disable-next-line
export async function createBenchmarkAction(formData: FormData) {
	const supabase = await requireAdmin();
	const id = requiredString(formData.get("id"), "id");
	const name = requiredString(formData.get("name"), "name");

	const { error } = await supabase.from("data_benchmarks").insert({
		id,
		name,
		category: optionalString(formData.get("category")),
		link: optionalString(formData.get("link")),
		ascending_order:
			optionalString(formData.get("ascending_order")) === "higher"
				? true
				: optionalString(formData.get("ascending_order")) === "lower"
					? false
					: null,
	});
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ benchmarkIds: [id] });
	revalidateBenchmarkDataTags({ benchmarkId: id });
	revalidatePath("/internal/data/benchmarks");
}

// react-doctor-disable-next-line
export async function updateBenchmarkAction(id: string, formData: FormData) {
	const supabase = await requireAdmin();
	const { error } = await supabase
		.from("data_benchmarks")
		.update({
			name: requiredString(formData.get("name"), "name"),
			category: optionalString(formData.get("category")),
			link: optionalString(formData.get("link")),
			ascending_order:
				optionalString(formData.get("ascending_order")) === "higher"
					? true
					: optionalString(formData.get("ascending_order")) === "lower"
						? false
						: null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ benchmarkIds: [id] });
	revalidateBenchmarkDataTags({ benchmarkId: id });
	revalidatePath("/internal/data/benchmarks");
}

// react-doctor-disable-next-line
export async function deleteBenchmarkAction(id: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase.from("data_benchmarks").delete().eq("id", id);
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ benchmarkIds: [id] });
	revalidateBenchmarkDataTags({ benchmarkId: id });
	revalidatePath("/internal/data/benchmarks");
}

// react-doctor-disable-next-line
export async function createModelAction(formData: FormData) {
	const supabase = await requireAdmin();
	const modelId = requiredString(formData.get("model_id"), "model_id");
	const name = requiredString(formData.get("name"), "name");
	const organisationId = requiredString(formData.get("organisation_id"), "organisation_id");
	const selectedFamilyId = optionalString(formData.get("family_id"));
	const familyPayload = parseJsonField<{
		family_id?: string | null;
		family_name?: string | null;
		family_description?: string | null;
	}>(formData.get("family_payload"), "family_payload", {});

	const providerModels = parseJsonField<
		Array<{
			provider_id?: string;
			api_model_id?: string;
			provider_model_slug?: string | null;
			prompt_training_policy_override?: string | null;
			prompt_training_override_notes?: string | null;
			prompt_training_override_source_url?: string | null;
			is_active_gateway?: boolean;
			input_modalities?: string[] | string | null;
			output_modalities?: string[] | string | null;
			quantization_scheme?: string | null;
			context_length?: number | null;
			max_output_tokens?: number | null;
			effective_from?: string | null;
			effective_to?: string | null;
		}>
	>(formData.get("provider_models_payload"), "provider_models_payload", []);

	const providerCapabilities = parseJsonField<
		Array<{
			provider_id?: string;
			api_model_id?: string;
			capability_id?: string;
			status?: CapabilityStatusOption | null;
			max_input_tokens?: number | null;
			max_output_tokens?: number | null;
			notes?: string | null;
			params?: Record<string, unknown> | null;
		}>
	>(formData.get("provider_capabilities_payload"), "provider_capabilities_payload", []);

	const benchmarkResults = parseJsonField<
		Array<{
			benchmark_id?: string;
			score?: string | number | null;
			is_self_reported?: boolean;
			other_info?: string | null;
			source_link?: string | null;
			variant?: string | null;
			rank?: number | null;
		}>
	>(formData.get("benchmark_results_payload"), "benchmark_results_payload", []);

	const newBenchmarks = parseJsonField<
		Array<{
			id?: string;
			name?: string;
			category?: string | null;
			link?: string | null;
			ascending_order?: "higher" | "lower" | boolean | null;
		}>
	>(formData.get("new_benchmarks_payload"), "new_benchmarks_payload", []);

	const pricingRules = parseJsonField<
		Array<{
			provider_id?: string;
			api_model_id?: string;
			capability_id?: string;
			pricing_plan?: string;
			meter?: string;
			unit?: string;
			unit_size?: number;
			price_per_unit?: number | string;
			currency?: string;
			note?: string | null;
			priority?: number;
			effective_from?: string | null;
			effective_to?: string | null;
		}>
	>(formData.get("pricing_rules_payload"), "pricing_rules_payload", []);
	const subscriptionPlanModels = parseJsonField<
		Array<{
			plan_uuid?: string;
			model_info?: unknown;
			rate_limit?: unknown;
			other_info?: unknown;
		}>
	>(formData.get("subscription_plan_models_payload"), "subscription_plan_models_payload", []);
	const newSubscriptionPlans = parseJsonField<
		Array<{
			plan_uuid?: string;
			plan_id?: string;
			name?: string;
			frequency?: string | null;
			price?: number | string | null;
			currency?: string | null;
			description?: string | null;
			link?: string | null;
			organisation_id?: string | null;
		}>
	>(formData.get("new_subscription_plans_payload"), "new_subscription_plans_payload", []);
	const modelDetails = parseJsonField<
		Array<{
			detail_name?: string;
			detail_value?: string | number | null;
		}>
	>(formData.get("model_details_payload"), "model_details_payload", []);
	const modelLinks = parseJsonField<
		Array<{
			platform?: string;
			kind?: string;
			title?: string | null;
			url?: string | null;
		}>
	>(formData.get("model_links_payload"), "model_links_payload", []);

	let resolvedFamilyId = selectedFamilyId;
	const familyName = typeof familyPayload.family_name === "string" ? familyPayload.family_name.trim() : "";
	if (familyName) {
		const nextFamilyId = familyPayload.family_id?.trim() || slugifyId(familyName);
		if (!nextFamilyId) throw new Error("family_id is required");
		const { error: familyError } = await supabase
			.from("data_model_families")
			.upsert(
				{
					family_id: nextFamilyId,
					family_name: familyName,
					family_description: familyPayload.family_description?.trim() || null,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "family_id" }
			);
		if (familyError) throw new Error(familyError.message);
		resolvedFamilyId = nextFamilyId;
	}

	let insertedModel = false;
	try {
		const inferredOrganisationId = inferOrganisationIdFromApiModelId(modelId);
		const canonicalOrganisationId = organisationId || inferredOrganisationId;
		if (!canonicalOrganisationId) {
			throw new Error("organisation_id is required");
		}

		const { error: apiModelError } = await supabase
			.from("data_api_models")
			.upsert(
				{
					api_model_id: modelId,
					organisation_id: canonicalOrganisationId,
					display_name: name,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "api_model_id" }
			);
		if (apiModelError) throw new Error(apiModelError.message);

		const { error } = await supabase.from("data_models").insert({
			model_id: modelId,
			name,
			organisation_id: organisationId,
			family_id: resolvedFamilyId,
			status: normalizeModelStatus(optionalString(formData.get("status"))),
			previous_model_id: optionalString(formData.get("previous_model_id")),
			release_date: optionalString(formData.get("release_date")),
			announcement_date: optionalString(formData.get("announcement_date")),
			deprecation_date: optionalString(formData.get("deprecation_date")),
			retirement_date: optionalString(formData.get("retirement_date")),
			license: optionalString(formData.get("license")),
			input_types: normalizeCoreTypes(formData.get("input_types")),
			output_types: normalizeCoreTypes(formData.get("output_types")),
			hidden: formData.get("hidden") === "on",
		});
		if (error) throw new Error(error.message);
		insertedModel = true;

		if (newBenchmarks.length > 0) {
			const benchmarkRows = newBenchmarks
				.filter((benchmark) => benchmark.id && benchmark.name)
				.map((benchmark) => {
					let ascendingOrder: boolean | null = null;
					if (benchmark.ascending_order === "higher" || benchmark.ascending_order === true) ascendingOrder = true;
					if (benchmark.ascending_order === "lower" || benchmark.ascending_order === false) ascendingOrder = false;
					return {
						id: benchmark.id!.trim(),
						name: benchmark.name!.trim(),
						category: benchmark.category?.trim() || null,
						link: benchmark.link?.trim() || null,
						ascending_order: ascendingOrder,
					};
				});
			if (benchmarkRows.length > 0) {
				const { error: benchmarkError } = await supabase
					.from("data_benchmarks")
					.upsert(benchmarkRows, { onConflict: "id" });
				if (benchmarkError) throw new Error(benchmarkError.message);
			}
		}

	const providerModelRows = providerModels
		.filter((row) => row.provider_id)
		.map((row) => {
			const apiModelId = row.api_model_id?.trim() || modelId;
			const overrideRaw =
				typeof row.prompt_training_policy_override === "string"
					? row.prompt_training_policy_override.trim()
					: "";
			return {
				provider_id: row.provider_id!.trim(),
				api_model_id: apiModelId,
				provider_model_slug: row.provider_model_slug?.trim() || null,
				prompt_training_policy_override: overrideRaw
					? normalizeProviderPromptTrainingPolicy(overrideRaw)
					: null,
				prompt_training_override_notes:
					row.prompt_training_override_notes?.trim() || null,
				prompt_training_override_source_url:
					row.prompt_training_override_source_url?.trim() || null,
				is_active_gateway: Boolean(row.is_active_gateway),
				input_modalities: Array.isArray(row.input_modalities)
					? row.input_modalities.join(",")
					: (typeof row.input_modalities === "string" ? row.input_modalities : null),
				output_modalities: Array.isArray(row.output_modalities)
					? row.output_modalities.join(",")
					: (typeof row.output_modalities === "string" ? row.output_modalities : null),
				quantization_scheme: row.quantization_scheme?.trim() || null,
				context_length:
					typeof row.context_length === "number" && Number.isFinite(row.context_length)
						? row.context_length
						: null,
				max_output_tokens:
					typeof row.max_output_tokens === "number" && Number.isFinite(row.max_output_tokens)
						? row.max_output_tokens
						: null,
				effective_from: row.effective_from || null,
				effective_to: row.effective_to || null,
			};
		});

	const providerCapabilityRows = providerCapabilities
		.filter((row) => row.provider_id && row.capability_id)
		.map((row) => ({
			provider_id: row.provider_id!.trim(),
			api_model_id: row.api_model_id?.trim() || modelId,
			capability_id: row.capability_id!.trim(),
			status: normalizeCapabilityStatus(row.status),
			max_input_tokens: row.max_input_tokens ?? null,
			max_output_tokens: row.max_output_tokens ?? null,
			notes: row.notes?.trim() || null,
			params: row.params && typeof row.params === "object" ? row.params : {},
		}));

	const benchmarkRows = benchmarkResults
		.filter((row) => row.benchmark_id)
		.map((row) => ({
			benchmark_id: row.benchmark_id!.trim(),
			score: row.score ?? "",
			is_self_reported: Boolean(row.is_self_reported),
			other_info: row.other_info?.trim() || null,
			source_link: row.source_link?.trim() || null,
			variant: row.variant?.trim() || null,
		}));

	const pricingRuleRows = pricingRules
		.filter((row) => row.provider_id && row.capability_id && row.meter)
		.map((row) => ({
			provider_id: row.provider_id!.trim(),
			api_model_id: row.api_model_id?.trim() || modelId,
			capability_id: row.capability_id!.trim(),
			pricing_plan: row.pricing_plan?.trim() || "standard",
			meter: row.meter!.trim(),
			unit: row.unit?.trim() || "token",
			unit_size: Number(row.unit_size ?? 1),
			price_per_unit: Number(row.price_per_unit ?? 0),
			currency: row.currency?.trim() || "USD",
			note: row.note?.trim() || null,
			priority: Number(row.priority ?? 100),
			effective_from: row.effective_from || null,
			effective_to: row.effective_to || null,
		}));

	const modelDetailRows = modelDetails
		.map((row) => {
			const detailName = normalizeModelDetailName(row.detail_name);
			const detailValue = detailName ? normalizeModelDetailValue(detailName, row.detail_value) : null;
			if (!detailName || !detailValue) return null;
			return {
				detail_name: detailName,
				detail_value: detailValue,
			};
		})
		.filter((row): row is { detail_name: (typeof MODEL_DETAIL_NAME_OPTIONS)[number]; detail_value: string } => Boolean(row));

	const modelLinkRows = modelLinks
		.map((row) => {
			const kind = normalizeModelLinkKind(row.kind ?? row.platform);
			const url = typeof row.url === "string" ? row.url.trim() : "";
			if (!kind || !url) return null;
			return {
				platform: kind,
				kind,
				title: normalizeModelLinkTitle(row.title, kind),
				url,
			};
		})
		.filter((row): row is { platform: string; kind: string; title: string; url: string } => Boolean(row));

		const insertedInlinePlanRows = newSubscriptionPlans
			.map((row) => {
				const planId = row.plan_id?.trim();
				const planName = row.name?.trim();
				if (!planId || !planName) return null;
				const priceValue = Number(row.price ?? 0);
				return {
					plan_uuid: row.plan_uuid?.trim() || crypto.randomUUID(),
					plan_id: planId,
					name: planName,
					organisation_id: row.organisation_id?.trim() || canonicalOrganisationId,
					description: row.description?.trim() || null,
					frequency: row.frequency?.trim() || "monthly",
					price: Number.isFinite(priceValue) ? priceValue : 0,
					currency: row.currency?.trim() || "USD",
					link: row.link?.trim() || null,
					other_info: {},
				};
			})
			.filter(
				(
					row
				): row is {
					plan_uuid: string;
					plan_id: string;
					name: string;
					organisation_id: string;
					description: string | null;
					frequency: string;
					price: number;
					currency: string;
					link: string | null;
					other_info: Record<string, never>;
				} => Boolean(row)
			);

		if (insertedInlinePlanRows.length > 0) {
			const { error: planInsertError } = await supabase
				.from("data_subscription_plans")
				.upsert(insertedInlinePlanRows, { onConflict: "plan_uuid" });
			if (planInsertError) throw new Error(planInsertError.message);
		}

		const mergedSubscriptionPlanModels = [
			...subscriptionPlanModels
				.filter((row) => typeof row.plan_uuid === "string" && row.plan_uuid.trim())
				.map((row) => ({
					plan_uuid: row.plan_uuid!.trim(),
					model_info:
						row.model_info && typeof row.model_info === "object"
							? row.model_info
							: {},
					rate_limit:
						row.rate_limit && typeof row.rate_limit === "object"
							? row.rate_limit
							: {},
					other_info:
						row.other_info && typeof row.other_info === "object"
							? row.other_info
							: {},
				})),
			...insertedInlinePlanRows.map((row) => ({
				plan_uuid: row.plan_uuid,
				model_info: {},
				rate_limit: {},
				other_info: {},
			})),
		];

		if (
			providerModelRows.length ||
			providerCapabilityRows.length ||
			benchmarkRows.length ||
			pricingRuleRows.length ||
			modelDetailRows.length ||
			modelLinkRows.length ||
			mergedSubscriptionPlanModels.length
		) {
			await updateModel({
				modelId,
				provider_models: providerModelRows,
				provider_capabilities: providerCapabilityRows,
				benchmark_results: benchmarkRows,
				pricing_rules: pricingRuleRows,
				model_details: modelDetailRows,
				links: modelLinkRows,
				subscription_plan_models: mergedSubscriptionPlanModels,
			});
		}
	} catch (error) {
		if (insertedModel) {
			try {
				await deleteModelGraph(supabase, modelId);
			} catch (rollbackError) {
				console.error("[createModelAction] rollback failed", rollbackError);
			}
		}
		throw error;
	}

	revalidateModelDataTags({
		modelId,
		organisationIds: [organisationId],
	});
	await submitIndexNowUrls(
		getIndexNowModelUrls(modelId),
		`create model ${modelId}`,
	);
	revalidatePath("/internal/data/models");
}

// react-doctor-disable-next-line
export async function updateModelAction(modelId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const organisationId = requiredString(formData.get("organisation_id"), "organisation_id");
	const name = requiredString(formData.get("name"), "name");

	const { error: apiModelError } = await supabase
		.from("data_api_models")
		.upsert(
			{
				api_model_id: modelId,
				organisation_id: organisationId,
				display_name: name,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "api_model_id" }
		);
	if (apiModelError) throw new Error(apiModelError.message);

	const { error } = await supabase
		.from("data_models")
		.update({
			name,
			organisation_id: organisationId,
			status: normalizeModelStatus(optionalString(formData.get("status"))),
			previous_model_id: optionalString(formData.get("previous_model_id")),
			release_date: optionalString(formData.get("release_date")),
			announcement_date: optionalString(formData.get("announcement_date")),
			deprecation_date: optionalString(formData.get("deprecation_date")),
			retirement_date: optionalString(formData.get("retirement_date")),
			license: optionalString(formData.get("license")),
			input_types: normalizeCoreTypes(formData.get("input_types")),
			output_types: normalizeCoreTypes(formData.get("output_types")),
			hidden: formData.get("hidden") === "on",
			updated_at: new Date().toISOString(),
		})
		.eq("model_id", modelId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ modelId, organisationIds: [organisationId] });
	await submitIndexNowUrls(
		getIndexNowModelUrls(modelId),
		`update model ${modelId}`,
	);
	revalidatePath("/internal/data/models");
}

// react-doctor-disable-next-line
export async function deleteModelAction(modelId: string) {
	const supabase = await requireAdmin();
	const organisationIds = await resolveModelOrganisationIds(supabase, modelId);
	await deleteModelGraph(supabase, modelId);

	revalidateModelDataTags({ modelId, organisationIds });
	await submitIndexNowUrls(
		getIndexNowModelUrls(modelId),
		`delete model ${modelId}`,
	);
	revalidatePath("/internal/data/models");
}

async function resolveModelOrganisationIds(
	supabase: Awaited<ReturnType<typeof requireAdmin>>,
	modelId: string
) {
	const { data } = await supabase
		.from("data_models")
		.select("organisation_id")
		.eq("model_id", modelId)
		.maybeSingle();

	return data?.organisation_id ? [data.organisation_id] : [];
}

// react-doctor-disable-next-line
export async function revalidateSingleModelDataAction(modelId: string) {
	const supabase = await requireAdmin();
	const organisationIds = await resolveModelOrganisationIds(supabase, modelId);

	revalidateModelDataOnlyTags({ modelId, organisationIds });
	revalidatePath(`/internal/data/models/edit/${modelId}`);
	revalidatePath("/models");
	revalidatePath("/models/**");

	return { ok: true as const, message: "Model data cache revalidated." };
}

// react-doctor-disable-next-line
export async function revalidateSingleModelApiInfoAction(modelId: string) {
	await requireAdmin();

	revalidateModelApiInfoTags({ modelId });
	revalidatePath(`/internal/data/models/edit/${modelId}`);
	revalidatePath("/models");
	revalidatePath("/models/**");
	revalidatePath("/api-providers");
	revalidatePath("/api-providers/**");

	return { ok: true as const, message: "Model API info cache revalidated." };
}

// react-doctor-disable-next-line
export async function revalidateSingleModelAllAction(modelId: string) {
	const supabase = await requireAdmin();
	const organisationIds = await resolveModelOrganisationIds(supabase, modelId);

	revalidateModelDataTags({ modelId, organisationIds });
	revalidatePath(`/internal/data/models/edit/${modelId}`);
	revalidatePath("/models");
	revalidatePath("/models/**");
	revalidatePath("/api-providers");
	revalidatePath("/api-providers/**");

	return { ok: true as const, message: "All model caches revalidated." };
}
