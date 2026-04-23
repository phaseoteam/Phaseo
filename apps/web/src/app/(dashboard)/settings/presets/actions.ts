"use server";

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceIdFromCookieRaw } from "@/utils/workspaceCookie";
import { revalidatePath, revalidateTag } from "next/cache";
import {
	requireActingUser,
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

export type PresetConfig = {
	system_prompt?: string;
	models?: string[];
	only_providers?: string[];
	ignore_providers?: string[];
	parameters?: {
		temperature?: number;
		top_p?: number;
		top_k?: number;
		frequency_penalty?: number;
		presence_penalty?: number;
		repetition_penalty?: number;
		max_tokens?: number;
		seed?: number;
	};
	reasoning?: {
		enabled: boolean;
		effort?: "low" | "medium" | "high";
		max_tokens?: number;
		exclude_from_output?: boolean;
	};
};

export type PresetVisibility = "private" | "team" | "public";

export type CreatePresetInput = {
	name: string;
	description?: string;
	creatorUserId: string;
	workspaceId: string;
	config: PresetConfig;
	visibility?: PresetVisibility;
};

export type UpdatePresetInput = {
	id: string;
	name?: string;
	description?: string;
	config?: Partial<PresetConfig>;
	visibility?: PresetVisibility;
};

function validatePresetName(name: string): void {
	if (!name || typeof name !== "string") {
		throw new Error("Preset name is required");
	}

	const trimmedName = name.trim();

	if (!trimmedName.startsWith("@")) {
		throw new Error("Preset name must start with @");
	}

	if (trimmedName.length < 2) {
		throw new Error("Preset name is too short");
	}

	const validPattern = /^@[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
	if (!validPattern.test(trimmedName)) {
		throw new Error(
			"Preset name can only contain letters, numbers, hyphens, underscores, and periods after @"
		);
	}
}

function normalizePresetName(name: string): string {
	if (!name) return "";
	const trimmed = name.trim();
	if (!trimmed) return "";
	return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function sanitizeConfig(config: PresetConfig): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	if (config.system_prompt) {
		sanitized.system_prompt = config.system_prompt.trim().substring(0, 10000);
	}

	if (config.models && Array.isArray(config.models) && config.models.length > 0) {
		sanitized.models = config.models;
	}

	if (config.only_providers && Array.isArray(config.only_providers) && config.only_providers.length > 0) {
		sanitized.only_providers = config.only_providers;
	}

	if (config.ignore_providers && Array.isArray(config.ignore_providers) && config.ignore_providers.length > 0) {
		sanitized.ignore_providers = config.ignore_providers;
	}

	if (config.parameters) {
		const params = config.parameters;
		const sanitizedParams: Record<string, unknown> = {};

		if (typeof params.temperature === "number" && params.temperature >= 0 && params.temperature <= 2) {
			sanitizedParams.temperature = params.temperature;
		}
		if (typeof params.top_p === "number" && params.top_p >= 0 && params.top_p <= 1) {
			sanitizedParams.top_p = params.top_p;
		}
		if (typeof params.top_k === "number" && params.top_k >= 0) {
			sanitizedParams.top_k = params.top_k;
		}
		if (typeof params.frequency_penalty === "number" && params.frequency_penalty >= -2 && params.frequency_penalty <= 2) {
			sanitizedParams.frequency_penalty = params.frequency_penalty;
		}
		if (typeof params.presence_penalty === "number" && params.presence_penalty >= -2 && params.presence_penalty <= 2) {
			sanitizedParams.presence_penalty = params.presence_penalty;
		}
		if (typeof params.repetition_penalty === "number" && params.repetition_penalty >= 1) {
			sanitizedParams.repetition_penalty = params.repetition_penalty;
		}
		if (typeof params.max_tokens === "number" && params.max_tokens > 0) {
			sanitizedParams.max_tokens = params.max_tokens;
		}
		if (typeof params.seed === "number" && Number.isInteger(params.seed)) {
			sanitizedParams.seed = params.seed;
		}

		if (Object.keys(sanitizedParams).length > 0) {
			sanitized.parameters = sanitizedParams;
		}
	}

	if (config.reasoning) {
		const reasoning = config.reasoning;
		const sanitizedReasoning: Record<string, unknown> = {
			enabled: Boolean(reasoning.enabled),
		};

		if (reasoning.effort && ["low", "medium", "high"].includes(reasoning.effort)) {
			sanitizedReasoning.effort = reasoning.effort;
		}
		if (typeof reasoning.max_tokens === "number" && reasoning.max_tokens > 0) {
			sanitizedReasoning.max_tokens = reasoning.max_tokens;
		}
		if (typeof reasoning.exclude_from_output === "boolean") {
			sanitizedReasoning.exclude_from_output = reasoning.exclude_from_output;
		}

		sanitized.reasoning = sanitizedReasoning;
	}

	return sanitized;
}

function normalizeVisibility(value?: PresetVisibility): PresetVisibility {
	if (value === "private" || value === "team" || value === "public") {
		return value;
	}
	return "team";
}

function revalidatePresetDataCache(presetId?: string | null): void {
	revalidateTag("data:presets", "max");
	revalidateTag("data:presets:public", "max");
	if (presetId) {
		revalidateTag(`data:presets:${presetId}`, "max");
	}
	revalidatePath("/gateway/marketplace");
	if (presetId) {
		revalidatePath(`/gateway/marketplace/${presetId}`);
	}
}

async function generateUniquePresetName(
	supabase: Awaited<ReturnType<typeof createClient>>,
	workspaceId: string,
	baseName: string
) {
	const normalizedBase = normalizePresetName(baseName);
	if (!normalizedBase) {
		throw new Error("Preset name is required");
	}

	const { data: existing } = await supabase
		.from("presets")
		.select("name")
		.eq("workspace_id", workspaceId);

	const existingNames = new Set(
		(existing ?? [])
			.map((row: any) => (typeof row?.name === "string" ? row.name : ""))
			.filter(Boolean)
	);

	if (!existingNames.has(normalizedBase)) return normalizedBase;

	const copySuffix = `${normalizedBase}-copy`;
	if (!existingNames.has(copySuffix)) return copySuffix;

	for (let idx = 2; idx <= 20; idx += 1) {
		const candidate = `${normalizedBase}-copy-${idx}`;
		if (!existingNames.has(candidate)) return candidate;
	}

	throw new Error("Unable to generate a unique preset name");
}

export async function createPresetAction(input: CreatePresetInput) {
	const { name, description, creatorUserId, workspaceId, config, visibility } = input;

	if (!creatorUserId || typeof creatorUserId !== "string") {
		throw new Error("Creator user ID is required");
	}
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Workspace ID is required");
	}

	validatePresetName(name);

	const { supabase, user } = await requireAuthenticatedUser();
	requireActingUser(creatorUserId, user.id);
	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	const { data: existing } = await supabase
		.from("presets")
		.select("id")
		.eq("workspace_id", workspaceId)
		.eq("name", name.trim())
		.maybeSingle();

	if (existing) {
		throw new Error(`Preset "${name}" already exists in this workspace`);
	}

	const sanitizedConfig = sanitizeConfig(config);
	const normalizedVisibility = normalizeVisibility(visibility);

	const insertObj: Record<string, unknown> = {
		workspace_id: workspaceId,
		name: name.trim(),
		created_by: creatorUserId,
		config: sanitizedConfig,
		visibility: normalizedVisibility,
	};

	if (description) {
		insertObj.description = description.trim().substring(0, 500);
	}

	const { data, error } = await supabase
		.from("presets")
		.insert(insertObj)
		.select("id, created_at")
		.maybeSingle();

	if (error) {
		console.error("Failed to create preset:", error);
		throw new Error(`Failed to create preset: ${error.message}`);
	}

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(data?.id ?? null);

	return {
		id: data?.id,
		name: name.trim(),
		createdAt: data?.created_at,
	};
}

export async function forkPresetAction(sourcePresetId: string) {
	if (!sourcePresetId || typeof sourcePresetId !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		throw new Error("AUTH_REQUIRED");
	}

	const workspaceId = await getActiveWorkspaceIdFromCookieRaw();
	if (!workspaceId) {
		throw new Error("TEAM_REQUIRED");
	}

	const { data: source, error } = await supabase
		.from("presets")
		.select("id, name, description, config, visibility")
		.eq("id", sourcePresetId)
		.maybeSingle();

	if (error) {
		console.error("Failed to fetch source preset:", error);
		throw new Error("Failed to fetch preset");
	}

	if (!source || source.visibility !== "public") {
		throw new Error("Preset is not publicly available");
	}

	const uniqueName = await generateUniquePresetName(
		supabase,
		workspaceId,
		source.name || "@preset"
	);

	const insertObj: Record<string, unknown> = {
		workspace_id: workspaceId,
		name: uniqueName,
		created_by: user.id,
		config: source.config ?? {},
		visibility: "private",
		source_preset_id: source.id,
	};

	if (source.description) {
		insertObj.description = source.description;
	}

	const { data, error: insertError } = await supabase
		.from("presets")
		.insert(insertObj)
		.select("id")
		.maybeSingle();

	if (insertError) {
		console.error("Failed to fork preset:", insertError);
		throw new Error("Failed to copy preset");
	}

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(sourcePresetId);
	if (data?.id) {
		revalidatePresetDataCache(data.id);
	}

	return { id: data?.id, name: uniqueName };
}

export async function updatePresetAction(input: UpdatePresetInput) {
	const { id, name, description, config, visibility } = input;

	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();

	const { data: existing } = await supabase
		.from("presets")
		.select("id, workspace_id, name, config")
		.eq("id", id)
		.maybeSingle();

	if (!existing) {
		throw new Error("Preset not found");
	}
	await requireWorkspaceMembership(supabase, user.id, existing.workspace_id);

	const updateObj: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};

	if (name) {
		validatePresetName(name);

		const { data: duplicate } = await supabase
			.from("presets")
			.select("id")
			.eq("workspace_id", existing.workspace_id)
			.eq("name", name.trim())
			.neq("id", id)
			.maybeSingle();

		if (duplicate) {
			throw new Error(`Preset "${name}" already exists in this workspace`);
		}

		updateObj.name = name.trim();
	}

	if (description !== undefined) {
		updateObj.description = description?.trim().substring(0, 500) || null;
	}

	if (config !== undefined) {
		const existingConfig = (existing.config as Record<string, unknown>) || {};
		const mergedConfig = { ...existingConfig, ...sanitizeConfig(config as PresetConfig) };
		updateObj.config = mergedConfig;
	}

	if (visibility) {
		updateObj.visibility = normalizeVisibility(visibility);
	}

	const { error } = await supabase
		.from("presets")
		.update(updateObj)
		.eq("id", id);

	if (error) {
		console.error("Failed to update preset:", error);
		throw new Error(`Failed to update preset: ${error.message}`);
	}

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(id);

	return { success: true };
}

export async function deletePresetAction(id: string, confirmName?: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();

	const { data: existing, error: fetchError } = await supabase
		.from("presets")
		.select("name, workspace_id")
		.eq("id", id)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to fetch preset: ${fetchError.message}`);
	}

	if (!existing) {
		throw new Error("Preset not found");
	}
	if (!existing.workspace_id) throw new Error("Preset not found");
	await requireWorkspaceMembership(supabase, user.id, existing.workspace_id);

	if (confirmName) {
		if (existing.name !== confirmName) {
			throw new Error("Confirmation failed: Preset name does not match");
		}
	}

	const { error } = await supabase
		.from("presets")
		.delete()
		.eq("id", id);

	if (error) {
		console.error("Failed to delete preset:", error);
		throw new Error(`Failed to delete preset: ${error.message}`);
	}

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(id);

	return { success: true };
}

export async function getPresetById(id: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();

	const { data, error } = await supabase
		.from("presets")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) {
		console.error("Failed to fetch preset:", error);
		throw new Error(`Failed to fetch preset: ${error.message}`);
	}
	if (data?.workspace_id) {
		await requireWorkspaceMembership(supabase, user.id, data.workspace_id);
	}

	return data;
}

export async function listPresetsByTeam(workspaceId: string) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Valid workspace ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	const { data, error } = await supabase
		.from("presets")
		.select("*")
		.eq("workspace_id", workspaceId)
		.order("created_at", { ascending: false });

	if (error) {
		console.error("Failed to list presets:", error);
		throw new Error(`Failed to list presets: ${error.message}`);
	}

	return data;
}
