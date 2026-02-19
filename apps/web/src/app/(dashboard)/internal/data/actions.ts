"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { revalidateModelDataTags } from "@/lib/cache/revalidateDataTags";
import { updateModel } from "@/app/(dashboard)/models/actions";

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

const CORE_TYPE_OPTIONS = ["text", "image", "audio", "video"] as const;
const MODEL_DETAIL_NAME_OPTIONS = [
	"input_context_length",
	"output_context_length",
	"knowledge_cutoff",
	"parameter_count",
	"training_tokens",
] as const;
const MODEL_LINK_PLATFORM_OPTIONS = [
	"announcement",
	"api_reference",
	"paper",
	"playground",
	"repository",
	"weights",
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

function normalizeModelLinkPlatform(input: unknown): (typeof MODEL_LINK_PLATFORM_OPTIONS)[number] | null {
	if (typeof input !== "string") return null;
	const value = input.trim().toLowerCase();
	if (!value) return null;
	return MODEL_LINK_PLATFORM_OPTIONS.includes(value as (typeof MODEL_LINK_PLATFORM_OPTIONS)[number])
		? (value as (typeof MODEL_LINK_PLATFORM_OPTIONS)[number])
		: null;
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

const ORG_SOCIAL_PLATFORM_ALIASES: Record<string, (typeof ORG_SOCIAL_PLATFORM_ORDER)[number]> = {
	dicsord: "discord",
	twitter: "x",
	web: "website",
	site: "website",
};

function normalizeOrganisationPlatform(input: unknown): (typeof ORG_SOCIAL_PLATFORM_ORDER)[number] | null {
	if (typeof input !== "string") return null;
	const value = input.trim().toLowerCase();
	if (!value) return null;
	const canonical = ORG_SOCIAL_PLATFORM_ALIASES[value] ?? value;
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
			url: typeof link.url === "string" ? link.url.trim() : "",
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

export async function createAPIProviderAction(formData: FormData) {
	const supabase = await requireAdmin();
	const apiProviderId = requiredString(formData.get("api_provider_id"), "api_provider_id");
	const apiProviderName = requiredString(formData.get("api_provider_name"), "api_provider_name");

	const { error } = await supabase.from("data_api_providers").insert({
		api_provider_id: apiProviderId,
		api_provider_name: apiProviderName,
		description: optionalString(formData.get("description")),
		link: optionalString(formData.get("link")),
		country_code: optionalString(formData.get("country_code")),
	});
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	revalidatePath("/internal/data/api-providers");
}

export async function updateAPIProviderAction(apiProviderId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const { error } = await supabase
		.from("data_api_providers")
		.update({
			api_provider_name: requiredString(formData.get("api_provider_name"), "api_provider_name"),
			description: optionalString(formData.get("description")),
			link: optionalString(formData.get("link")),
			country_code: optionalString(formData.get("country_code")),
			updated_at: new Date().toISOString(),
		})
		.eq("api_provider_id", apiProviderId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	revalidatePath("/internal/data/api-providers");
}

export async function deleteAPIProviderAction(apiProviderId: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase
		.from("data_api_providers")
		.delete()
		.eq("api_provider_id", apiProviderId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	revalidatePath("/internal/data/api-providers");
}

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

	revalidateModelDataTags();
	revalidatePath("/internal/data/benchmarks");
}

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

	revalidateModelDataTags();
	revalidatePath("/internal/data/benchmarks");
}

export async function deleteBenchmarkAction(id: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase.from("data_benchmarks").delete().eq("id", id);
	if (error) throw new Error(error.message);

	revalidateModelDataTags();
	revalidatePath("/internal/data/benchmarks");
}

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
			is_active_gateway?: boolean;
			input_modalities?: string[] | string | null;
			output_modalities?: string[] | string | null;
			quantization_scheme?: string | null;
			effective_from?: string | null;
			effective_to?: string | null;
		}>
	>(formData.get("provider_models_payload"), "provider_models_payload", []);

	const providerCapabilities = parseJsonField<
		Array<{
			provider_id?: string;
			api_model_id?: string;
			capability_id?: string;
			status?: "active" | "deranked" | "disabled" | null;
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
	const modelDetails = parseJsonField<
		Array<{
			detail_name?: string;
			detail_value?: string | number | null;
		}>
	>(formData.get("model_details_payload"), "model_details_payload", []);
	const modelLinks = parseJsonField<
		Array<{
			platform?: string;
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

	const { error } = await supabase.from("data_models").insert({
		model_id: modelId,
		name,
		organisation_id: organisationId,
		family_id: resolvedFamilyId,
		status: optionalString(formData.get("status")) ?? "active",
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
		.filter((row) => row.provider_id && row.api_model_id)
		.map((row) => ({
			provider_id: row.provider_id!.trim(),
			api_model_id: row.api_model_id!.trim(),
			provider_model_slug: row.provider_model_slug?.trim() || null,
			is_active_gateway: Boolean(row.is_active_gateway),
			input_modalities: Array.isArray(row.input_modalities)
				? row.input_modalities.join(",")
				: (typeof row.input_modalities === "string" ? row.input_modalities : null),
			output_modalities: Array.isArray(row.output_modalities)
				? row.output_modalities.join(",")
				: (typeof row.output_modalities === "string" ? row.output_modalities : null),
			quantization_scheme: row.quantization_scheme?.trim() || null,
			effective_from: row.effective_from || null,
			effective_to: row.effective_to || null,
		}));

	const providerCapabilityRows = providerCapabilities
		.filter((row) => row.provider_id && row.api_model_id && row.capability_id)
		.map((row) => ({
			provider_id: row.provider_id!.trim(),
			api_model_id: row.api_model_id!.trim(),
			capability_id: row.capability_id!.trim(),
			status: row.status ?? "active",
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
		.filter((row) => row.provider_id && row.api_model_id && row.capability_id && row.meter)
		.map((row) => ({
			provider_id: row.provider_id!.trim(),
			api_model_id: row.api_model_id!.trim(),
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
			const platform = normalizeModelLinkPlatform(row.platform);
			const url = typeof row.url === "string" ? row.url.trim() : "";
			if (!platform || !url) return null;
			return {
				platform,
				url,
			};
		})
		.filter((row): row is { platform: (typeof MODEL_LINK_PLATFORM_OPTIONS)[number]; url: string } => Boolean(row));

	if (
		providerModelRows.length ||
		providerCapabilityRows.length ||
		benchmarkRows.length ||
		pricingRuleRows.length ||
		modelDetailRows.length ||
		modelLinkRows.length
	) {
		await updateModel({
			modelId,
			provider_models: providerModelRows,
			provider_capabilities: providerCapabilityRows,
			benchmark_results: benchmarkRows,
			pricing_rules: pricingRuleRows,
			model_details: modelDetailRows,
			links: modelLinkRows,
		});
	}

	revalidateModelDataTags({
		modelId,
		organisationIds: [organisationId],
	});
	revalidatePath("/internal/data/models");
}

export async function updateModelAction(modelId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const organisationId = requiredString(formData.get("organisation_id"), "organisation_id");
	const { error } = await supabase
		.from("data_models")
		.update({
			name: requiredString(formData.get("name"), "name"),
			organisation_id: organisationId,
			status: optionalString(formData.get("status")),
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
	revalidatePath("/internal/data/models");
}

export async function deleteModelAction(modelId: string) {
	const supabase = await requireAdmin();
	const { error } = await supabase.from("data_models").delete().eq("model_id", modelId);
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ modelId });
	revalidatePath("/internal/data/models");
}
