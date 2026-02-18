"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { revalidateModelDataTags } from "@/lib/cache/revalidateDataTags";

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

function requiredString(v: FormDataEntryValue | null, field: string) {
	const parsed = optionalString(v);
	if (!parsed) throw new Error(`${field} is required`);
	return parsed;
}

export async function createOrganisationAction(formData: FormData) {
	const supabase = await requireAdmin();
	const organisationId = requiredString(formData.get("organisation_id"), "organisation_id");
	const name = requiredString(formData.get("name"), "name");

	const { error } = await supabase.from("data_organisations").insert({
		organisation_id: organisationId,
		name,
		description: optionalString(formData.get("description")),
		country_code: optionalString(formData.get("country_code")),
		colour: optionalString(formData.get("colour")),
	});
	if (error) throw new Error(error.message);

	revalidateModelDataTags({ organisationIds: [organisationId] });
	revalidatePath("/internal/data/organisations");
}

export async function updateOrganisationAction(organisationId: string, formData: FormData) {
	const supabase = await requireAdmin();
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

	const { error } = await supabase.from("data_models").insert({
		model_id: modelId,
		name,
		organisation_id: optionalString(formData.get("organisation_id")),
		status: optionalString(formData.get("status")) ?? "active",
		release_date: optionalString(formData.get("release_date")),
		announcement_date: optionalString(formData.get("announcement_date")),
		deprecation_date: optionalString(formData.get("deprecation_date")),
		retirement_date: optionalString(formData.get("retirement_date")),
		input_types: optionalString(formData.get("input_types")),
		output_types: optionalString(formData.get("output_types")),
		hidden: formData.get("hidden") === "on",
	});
	if (error) throw new Error(error.message);

	revalidateModelDataTags({
		modelId,
		organisationIds: [optionalString(formData.get("organisation_id"))],
	});
	revalidatePath("/internal/data/models");
}

export async function updateModelAction(modelId: string, formData: FormData) {
	const supabase = await requireAdmin();
	const organisationId = optionalString(formData.get("organisation_id"));
	const { error } = await supabase
		.from("data_models")
		.update({
			name: requiredString(formData.get("name"), "name"),
			organisation_id: organisationId,
			status: optionalString(formData.get("status")),
			release_date: optionalString(formData.get("release_date")),
			announcement_date: optionalString(formData.get("announcement_date")),
			deprecation_date: optionalString(formData.get("deprecation_date")),
			retirement_date: optionalString(formData.get("retirement_date")),
			input_types: optionalString(formData.get("input_types")),
			output_types: optionalString(formData.get("output_types")),
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
