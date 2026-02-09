"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidateModelDataTags } from "@/lib/cache/revalidateDataTags";

async function checkAdminAuth() {
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		return { authorized: false, supabase: null };
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		return { authorized: false, supabase: null };
	}

	return { authorized: true, supabase };
}

// ============================================================================
// MODEL DETAILS
// ============================================================================

export interface UpdateModelDetailsInput {
	modelId: string;
	details: Array<{
		name: string;
		value: string;
	}>;
}

export async function updateModelDetails(input: UpdateModelDetailsInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	// Delete existing details
	await supabase
		.from("data_model_details")
		.delete()
		.eq("model_id", input.modelId);

	// Insert new details
	if (input.details.length > 0) {
		const detailsToInsert = input.details.map((d) => ({
			model_id: input.modelId,
			detail_name: d.name,
			detail_value: d.value,
		}));

		const { error } = await supabase
			.from("data_model_details")
			.insert(detailsToInsert);

		if (error) {
			return { success: false, error: error.message };
		}
	}

	revalidateModelDataTags({ modelId: input.modelId });

	return { success: true };
}

// ============================================================================
// MODEL ORGANIZATION
// ============================================================================

export interface UpdateModelOrganizationInput {
	modelId: string;
	organisationId: string | null;
}

export async function updateModelOrganization(
	input: UpdateModelOrganizationInput
) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { error } = await supabase
		.from("data_models")
		.update({ organisation_id: input.organisationId })
		.eq("model_id", input.modelId);

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({
		modelId: input.modelId,
		organisationIds: [input.organisationId ?? null],
	});

	return { success: true };
}

// ============================================================================
// MODEL LINKS
// ============================================================================

export interface UpdateModelLinksInput {
	modelId: string;
	links: Array<{
		type: string;
		url: string;
	}>;
}

export async function updateModelLinks(input: UpdateModelLinksInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	// Delete existing links
	await supabase.from("data_model_links").delete().eq("model_id", input.modelId);

	// Insert new links
	if (input.links.length > 0) {
		const linksToInsert = input.links.map((l) => ({
			model_id: input.modelId,
			link_type: l.type,
			link_url: l.url,
		}));

		const { error } = await supabase
			.from("data_model_links")
			.insert(linksToInsert);

		if (error) {
			return { success: false, error: error.message };
		}
	}

	revalidateModelDataTags({ modelId: input.modelId });

	return { success: true };
}

// ============================================================================
// MODEL ALIASES
// ============================================================================

export interface UpdateModelAliasesInput {
	modelId: string;
	aliases: Array<{
		alias: string;
		enabled: boolean;
	}>;
}

export async function updateModelAliases(input: UpdateModelAliasesInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	// Delete existing aliases
	await supabase
		.from("data_api_model_aliases")
		.delete()
		.eq("api_model_id", input.modelId);

	// Insert new aliases
	if (input.aliases.length > 0) {
		const aliasesToInsert = input.aliases.map((a) => ({
			api_model_id: input.modelId,
			alias_slug: a.alias,
			is_enabled: a.enabled,
		}));

		const { error } = await supabase
			.from("data_api_model_aliases")
			.insert(aliasesToInsert);

		if (error) {
			return { success: false, error: error.message };
		}
	}

	revalidateModelDataTags({ modelId: input.modelId });

	return { success: true };
}

// ============================================================================
// PROVIDER MODEL
// ============================================================================

export interface CreateProviderModelInput {
	providerId: string;
	apiModelId: string;
	internalModelId: string;
	isActiveGateway: boolean;
	inputModalities: string[];
	outputModalities: string[];
	effectiveFrom?: string;
	effectiveTo?: string;
}

export async function createProviderModel(input: CreateProviderModelInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { error } = await supabase.from("data_api_provider_models").insert({
		provider_id: input.providerId,
		api_model_id: input.apiModelId,
		internal_model_id: input.internalModelId,
		is_active_gateway: input.isActiveGateway,
		input_modalities: input.inputModalities,
		output_modalities: input.outputModalities,
		effective_from: input.effectiveFrom || null,
		effective_to: input.effectiveTo || null,
	});

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({ modelId: input.internalModelId });

	return { success: true };
}

export interface UpdateProviderModelInput {
	providerApiModelId: string;
	isActiveGateway?: boolean;
	inputModalities?: string[];
	outputModalities?: string[];
	effectiveFrom?: string;
	effectiveTo?: string;
}

export async function updateProviderModel(input: UpdateProviderModelInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { data: providerModelRow } = await supabase
		.from("data_api_provider_models")
		.select("internal_model_id")
		.eq("provider_api_model_id", input.providerApiModelId)
		.maybeSingle();

	const updateData: any = {};
	if (input.isActiveGateway !== undefined)
		updateData.is_active_gateway = input.isActiveGateway;
	if (input.inputModalities !== undefined)
		updateData.input_modalities = input.inputModalities;
	if (input.outputModalities !== undefined)
		updateData.output_modalities = input.outputModalities;
	if (input.effectiveFrom !== undefined)
		updateData.effective_from = input.effectiveFrom || null;
	if (input.effectiveTo !== undefined)
		updateData.effective_to = input.effectiveTo || null;

	const { error } = await supabase
		.from("data_api_provider_models")
		.update(updateData)
		.eq("provider_api_model_id", input.providerApiModelId);

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({
		modelId: providerModelRow?.internal_model_id ?? null,
	});

	return { success: true };
}

export async function deleteProviderModel(providerApiModelId: string) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { data: providerModelRow } = await supabase
		.from("data_api_provider_models")
		.select("internal_model_id")
		.eq("provider_api_model_id", providerApiModelId)
		.maybeSingle();

	const { error } = await supabase
		.from("data_api_provider_models")
		.delete()
		.eq("provider_api_model_id", providerApiModelId);

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({
		modelId: providerModelRow?.internal_model_id ?? null,
	});

	return { success: true };
}

// ============================================================================
// BENCHMARK RESULTS
// ============================================================================

export interface CreateBenchmarkResultInput {
	modelId: string;
	benchmarkId: string;
	score: string;
	isSelfReported: boolean;
	otherInfo?: string;
	sourceLink?: string;
	rank?: number;
}

export async function createBenchmarkResult(input: CreateBenchmarkResultInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { error } = await supabase.from("data_benchmark_results").insert({
		model_id: input.modelId,
		benchmark_id: input.benchmarkId,
		score: input.score,
		is_self_reported: input.isSelfReported,
		other_info: input.otherInfo || null,
		source_link: input.sourceLink || null,
		rank: input.rank || null,
	});

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({ modelId: input.modelId });

	return { success: true };
}

export interface UpdateBenchmarkResultInput {
	resultId: string;
	score?: string;
	isSelfReported?: boolean;
	otherInfo?: string;
	sourceLink?: string;
	rank?: number;
}

export async function updateBenchmarkResult(input: UpdateBenchmarkResultInput) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const updateData: any = {};
	if (input.score !== undefined) updateData.score = input.score;
	if (input.isSelfReported !== undefined)
		updateData.is_self_reported = input.isSelfReported;
	if (input.otherInfo !== undefined) updateData.other_info = input.otherInfo || null;
	if (input.sourceLink !== undefined) updateData.source_link = input.sourceLink || null;
	if (input.rank !== undefined) updateData.rank = input.rank || null;

	const { error } = await supabase
		.from("data_benchmark_results")
		.update(updateData)
		.eq("id", input.resultId);

	if (error) {
		return { success: false, error: error.message };
	}

	const { data: benchmarkRow } = await supabase
		.from("data_benchmark_results")
		.select("model_id")
		.eq("id", input.resultId)
		.maybeSingle();

	revalidateModelDataTags({ modelId: benchmarkRow?.model_id ?? null });

	return { success: true };
}

export async function deleteBenchmarkResult(resultId: string) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	const { data: benchmarkRow } = await supabase
		.from("data_benchmark_results")
		.select("model_id")
		.eq("id", resultId)
		.maybeSingle();

	const { error } = await supabase
		.from("data_benchmark_results")
		.delete()
		.eq("id", resultId);

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({ modelId: benchmarkRow?.model_id ?? null });

	return { success: true };
}

// ============================================================================
// DELETE MODEL
// ============================================================================

export async function deleteModel(modelId: string) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized" };
	}

	// Note: This will cascade delete related records if foreign keys are set up
	const { error } = await supabase
		.from("data_models")
		.delete()
		.eq("model_id", modelId);

	if (error) {
		return { success: false, error: error.message };
	}

	revalidateModelDataTags({ modelId });

	return { success: true };
}

// ============================================================================
// FETCH COMPLETE MODEL DATA
// ============================================================================

export interface CompleteModelData {
	// Basic fields
	model_id: string;
	name: string;
	organisation_id: string | null;
	status: string | null;
	hidden: boolean;
	release_date: string | null;
	retirement_date: string | null;
	announcement_date: string | null;
	deprecation_date: string | null;
	license: string | null;
	family_id: string | null;
	previous_model_id: string | null;
	input_types: string[];
	output_types: string[];

	// Related data
	details: Array<{ detail_name: string; detail_value: string }>;
	links: Array<{ link_type: string; link_url: string }>;
	aliases: Array<{ alias_slug: string; is_enabled: boolean }>;
	provider_models: Array<{
		provider_api_model_id: string;
		provider_id: string;
		api_model_id: string;
		is_active_gateway: boolean;
		input_modalities: string[];
		output_modalities: string[];
		effective_from: string | null;
		effective_to: string | null;
	}>;
	benchmarks: Array<{
		id: string;
		benchmark_id: string;
		benchmark_name: string;
		score: string;
		is_self_reported: boolean;
		other_info: string | null;
		source_link: string | null;
		rank: number | null;
	}>;
}

export async function fetchCompleteModelData(modelId: string) {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized", data: null };
	}

	// Fetch main model data
	const { data: model, error: modelError } = await supabase
		.from("data_models")
		.select(`
			model_id,
			name,
			organisation_id,
			status,
			hidden,
			release_date,
			retirement_date,
			announcement_date,
			deprecation_date,
			license,
			family_id,
			previous_model_id,
			input_types,
			output_types
		`)
		.eq("model_id", modelId)
		.single();

	if (modelError || !model) {
		return { success: false, error: "Model not found", data: null };
	}

	// Fetch details
	const { data: details } = await supabase
		.from("data_model_details")
		.select("detail_name, detail_value")
		.eq("model_id", modelId);

	// Fetch links
	const { data: links } = await supabase
		.from("data_model_links")
		.select("link_type, link_url")
		.eq("model_id", modelId);

	// Fetch aliases
	const { data: aliases } = await supabase
		.from("data_api_model_aliases")
		.select("alias_slug, is_enabled")
		.eq("api_model_id", modelId);

	// Fetch provider models
	const { data: providerModels } = await supabase
		.from("data_api_provider_models")
		.select(`
			provider_api_model_id,
			provider_id,
			api_model_id,
			is_active_gateway,
			input_modalities,
			output_modalities,
			effective_from,
			effective_to
		`)
		.eq("internal_model_id", modelId);

	// Fetch benchmarks
	const { data: benchmarks } = await supabase
		.from("data_benchmark_results")
		.select(`
			id,
			benchmark_id,
			score,
			is_self_reported,
			other_info,
			source_link,
			rank,
			benchmark:data_benchmarks(name)
		`)
		.eq("model_id", modelId);

	const completeData: CompleteModelData = {
		...model,
		input_types: Array.isArray(model.input_types) ? model.input_types : [],
		output_types: Array.isArray(model.output_types) ? model.output_types : [],
		details: (details || []).map((d) => ({
			detail_name: d.detail_name,
			detail_value: String(d.detail_value || ""),
		})),
		links: (links || []).map((l) => ({
			link_type: l.link_type,
			link_url: l.link_url,
		})),
		aliases: (aliases || []).map((a) => ({
			alias_slug: a.alias_slug,
			is_enabled: a.is_enabled,
		})),
		provider_models: (providerModels || []).map((pm) => ({
			provider_api_model_id: pm.provider_api_model_id,
			provider_id: pm.provider_id,
			api_model_id: pm.api_model_id,
			is_active_gateway: pm.is_active_gateway,
			input_modalities: Array.isArray(pm.input_modalities) ? pm.input_modalities : [],
			output_modalities: Array.isArray(pm.output_modalities) ? pm.output_modalities : [],
			effective_from: pm.effective_from,
			effective_to: pm.effective_to,
		})),
		benchmarks: (benchmarks || []).map((b) => ({
			id: String(b.id),
			benchmark_id: b.benchmark_id,
			benchmark_name: (b.benchmark as any)?.name || b.benchmark_id,
			score: String(b.score),
			is_self_reported: b.is_self_reported,
			other_info: b.other_info,
			source_link: b.source_link,
			rank: b.rank,
		})),
	};

	return { success: true, data: completeData };
}

// ============================================================================
// FETCH HELPERS
// ============================================================================

export async function fetchOrganisations() {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized", data: [] };
	}

	const { data, error } = await supabase
		.from("data_organisations")
		.select("organisation_id, name")
		.order("name");

	if (error) {
		return { success: false, error: error.message, data: [] };
	}

	return {
		success: true,
		data: (data || []).map((org) => ({
			id: org.organisation_id,
			name: org.name,
		})),
	};
}

export async function fetchProviders() {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized", data: [] };
	}

	const { data, error } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name")
		.order("api_provider_name");

	if (error) {
		return { success: false, error: error.message, data: [] };
	}

	return {
		success: true,
		data: (data || []).map((provider) => ({
			id: provider.api_provider_id,
			name: provider.api_provider_name || provider.api_provider_id,
		})),
	};
}

export async function fetchBenchmarks() {
	const { authorized, supabase } = await checkAdminAuth();
	if (!authorized || !supabase) {
		return { success: false, error: "Unauthorized", data: [] };
	}

	const { data, error } = await supabase
		.from("data_benchmarks")
		.select("benchmark_id, name")
		.order("name");

	if (error) {
		return { success: false, error: error.message, data: [] };
	}

	return {
		success: true,
		data: (data || []).map((benchmark) => ({
			id: benchmark.benchmark_id,
			name: benchmark.name || benchmark.benchmark_id,
		})),
	};
}
