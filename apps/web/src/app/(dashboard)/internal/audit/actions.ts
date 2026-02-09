"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidateModelDataTags } from "@/lib/cache/revalidateDataTags";

export interface CreateModelInput {
	modelId: string;
	name: string;
	organisationId?: string | null;
	releaseDate?: string | null;
	retirementDate?: string | null;
	status?: string | null;
	hidden?: boolean;
	inputTypes?: string[];
	outputTypes?: string[];
}

export async function createModel(input: CreateModelInput) {
	const supabase = await createClient();

	// Check admin authentication
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		return { success: false, error: "Unauthorized" };
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		return { success: false, error: "Unauthorized" };
	}

	// Create the model
	const { error } = await supabase.from("data_models").insert({
		model_id: input.modelId,
		name: input.name,
		organisation_id: input.organisationId || null,
		release_date: input.releaseDate || null,
		retirement_date: input.retirementDate || null,
		status: input.status || "active",
		hidden: input.hidden || false,
		input_types: input.inputTypes || [],
		output_types: input.outputTypes || [],
	});

	if (error) {
		return { success: false, error: error.message };
	}

	// Revalidate caches
	revalidateModelDataTags({
		modelId: input.modelId,
		organisationIds: [input.organisationId ?? null],
	});

	return { success: true };
}

export interface UpdateModelInput {
	modelId: string;
	name?: string;
	organisationId?: string | null;
	releaseDate?: string | null;
	retirementDate?: string | null;
	announcementDate?: string | null;
	deprecationDate?: string | null;
	status?: string | null;
	hidden?: boolean;
	license?: string | null;
	familyId?: string | null;
	previousModelId?: string | null;
	inputTypes?: string[];
	outputTypes?: string[];
}

export async function updateModel(input: UpdateModelInput) {
	const supabase = await createClient();

	// Check admin authentication
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		return { success: false, error: "Unauthorized" };
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		return { success: false, error: "Unauthorized" };
	}

	// Update the model
	const updateData: any = {};

	if (input.name !== undefined) updateData.name = input.name;
	if (input.organisationId !== undefined)
		updateData.organisation_id = input.organisationId;
	if (input.releaseDate !== undefined)
		updateData.release_date = input.releaseDate;
	if (input.retirementDate !== undefined)
		updateData.retirement_date = input.retirementDate;
	if (input.announcementDate !== undefined)
		updateData.announcement_date = input.announcementDate;
	if (input.deprecationDate !== undefined)
		updateData.deprecation_date = input.deprecationDate;
	if (input.status !== undefined) updateData.status = input.status;
	if (input.hidden !== undefined) updateData.hidden = input.hidden;
	if (input.license !== undefined) updateData.license = input.license;
	if (input.familyId !== undefined) updateData.family_id = input.familyId;
	if (input.previousModelId !== undefined)
		updateData.previous_model_id = input.previousModelId;
	if (input.inputTypes !== undefined)
		updateData.input_types = input.inputTypes;
	if (input.outputTypes !== undefined)
		updateData.output_types = input.outputTypes;

	const { error } = await supabase
		.from("data_models")
		.update(updateData)
		.eq("model_id", input.modelId);

	if (error) {
		return { success: false, error: error.message };
	}

	// Revalidate caches
	revalidateModelDataTags({
		modelId: input.modelId,
		organisationIds: [input.organisationId ?? null],
	});

	return { success: true };
}
