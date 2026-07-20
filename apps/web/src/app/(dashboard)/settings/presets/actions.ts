"use server";

import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { revalidatePath, revalidateTag } from "next/cache";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export type PresetConfig = {
	system_prompt?: string;
	models?: string[];
	only_providers?: string[];
	ignore_providers?: string[];
	provider?: {
		order?: string[];
		only?: string[];
		ignore?: string[];
		required_execution_region?: string;
		required_data_region?: string;
		require_zero_data_retention?: boolean;
		max_price?: {
			prompt?: number;
			completion?: number;
			image?: number;
			audio?: number;
			request?: number;
		};
		preferred_min_throughput?: number | Record<string, number>;
		preferred_max_latency?: number | Record<string, number>;
	};
	plugins?: Array<Record<string, unknown>>;
	routing_mode?: "balanced" | "price" | "latency" | "throughput";
	response_caching?: {
		enabled?: boolean;
		ttl_seconds?: number;
	};
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
	slug?: string;
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

	if (config.provider && typeof config.provider === "object") {
		const providerConfig: Record<string, unknown> = {};
		if (Array.isArray(config.provider.order) && config.provider.order.length > 0) {
			providerConfig.order = config.provider.order;
		}
		if (Array.isArray(config.provider.only) && config.provider.only.length > 0) {
			providerConfig.only = config.provider.only;
		}
		if (Array.isArray(config.provider.ignore) && config.provider.ignore.length > 0) {
			providerConfig.ignore = config.provider.ignore;
		}
		if (
			typeof config.provider.required_execution_region === "string" &&
			config.provider.required_execution_region.trim()
		) {
			providerConfig.required_execution_region =
				config.provider.required_execution_region.trim().toLowerCase();
		}
		if (
			typeof config.provider.required_data_region === "string" &&
			config.provider.required_data_region.trim()
		) {
			providerConfig.required_data_region =
				config.provider.required_data_region.trim().toLowerCase();
		}
		if (typeof config.provider.require_zero_data_retention === "boolean") {
			providerConfig.require_zero_data_retention =
				config.provider.require_zero_data_retention;
		}
		if (config.provider.max_price && typeof config.provider.max_price === "object") {
			const maxPrice: Record<string, number> = {};
			for (const meter of ["prompt", "completion", "image", "audio", "request"] as const) {
				const value = config.provider.max_price[meter];
				if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
					maxPrice[meter] = value;
				}
			}
			if (Object.keys(maxPrice).length > 0) {
				providerConfig.max_price = maxPrice;
			}
		}
		if (
			typeof config.provider.preferred_min_throughput === "number" ||
			(config.provider.preferred_min_throughput &&
				typeof config.provider.preferred_min_throughput === "object")
		) {
			providerConfig.preferred_min_throughput =
				config.provider.preferred_min_throughput;
		}
		if (
			typeof config.provider.preferred_max_latency === "number" ||
			(config.provider.preferred_max_latency &&
				typeof config.provider.preferred_max_latency === "object")
		) {
			providerConfig.preferred_max_latency =
				config.provider.preferred_max_latency;
		}
		if (Object.keys(providerConfig).length > 0) {
			sanitized.provider = providerConfig;
		}
	}

	if (
		config.routing_mode &&
		["balanced", "price", "latency", "throughput"].includes(config.routing_mode)
	) {
		sanitized.routing_mode = config.routing_mode;
	}

	if (Array.isArray(config.plugins) && config.plugins.length > 0) {
		sanitized.plugins = config.plugins;
	}

	if (config.response_caching && typeof config.response_caching === "object") {
		const responseCaching: Record<string, unknown> = {};
		if (typeof config.response_caching.enabled === "boolean") {
			responseCaching.enabled = config.response_caching.enabled;
		}
		if (
			typeof config.response_caching.ttl_seconds === "number" &&
			Number.isFinite(config.response_caching.ttl_seconds) &&
			config.response_caching.ttl_seconds > 0
		) {
			responseCaching.ttl_seconds = config.response_caching.ttl_seconds;
		}
		if (Object.keys(responseCaching).length > 0) {
			sanitized.response_caching = responseCaching;
		}
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

export async function createPresetAction(input: CreatePresetInput) {
	const { name, description, creatorUserId, workspaceId, config, visibility } = input;

	if (!creatorUserId || typeof creatorUserId !== "string") {
		throw new Error("Creator user ID is required");
	}
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Workspace ID is required");
	}

	validatePresetName(name);

	const sanitizedConfig = sanitizeConfig(config);
	const normalizedVisibility = normalizeVisibility(visibility);
	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	const data = await fetchAccountWebApi<{ id?: string; name: string; createdAt?: string }>("/api/account/settings/presets", accessToken, { method: "POST", body: JSON.stringify({ workspaceId, name: name.trim(), description, creatorUserId, config: sanitizedConfig, visibility: normalizedVisibility }) });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(data.id ?? null);
	return data;
}

export async function forkPresetAction(sourcePresetId: string) {
	if (!sourcePresetId || typeof sourcePresetId !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		throw new Error("WORKSPACE_REQUIRED");
	}
	if (!context.accessToken) throw new Error("AUTH_REQUIRED");
	const data = await fetchAccountWebApi<{ id?: string; name: string }>(`/api/account/settings/presets/${encodeURIComponent(sourcePresetId)}/fork`, context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId }) });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(sourcePresetId);
	if (data.id) {
		revalidatePresetDataCache(data.id);
	}
	return data;
}

export async function updatePresetAction(input: UpdatePresetInput) {
	const { id, name, description, config, visibility } = input;

	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const updateObj: Record<string, unknown> = {};

	if (name) {
		validatePresetName(name);

		updateObj.name = name.trim();
	}

	if (description !== undefined) {
		updateObj.description = description?.trim().substring(0, 500) || null;
	}

	if (config !== undefined) {
		updateObj.config = sanitizeConfig(config as PresetConfig);
	}

	if (visibility) {
		updateObj.visibility = normalizeVisibility(visibility);
	}

	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/settings/presets/${encodeURIComponent(id)}`, accessToken, { method: "PUT", body: JSON.stringify(updateObj) });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(id);

	return { success: true };
}

export async function deletePresetAction(id: string, confirmName?: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	const query = confirmName ? `?confirmName=${encodeURIComponent(confirmName)}` : "";
	await fetchAccountWebApi(`/api/account/settings/presets/${encodeURIComponent(id)}${query}`, accessToken, { method: "DELETE" });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(id);

	return { success: true };
}

export async function getPresetById(id: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	return (await fetchAccountWebApi<{ preset: any }>(`/api/account/settings/presets/${encodeURIComponent(id)}`, accessToken)).preset;
}

export async function listPresetsByWorkspace(workspaceId: string) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Valid workspace ID is required");
	}

	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	return (await fetchAccountWebApi<{ presets: any[] }>(`/api/account/settings/presets/list?workspaceId=${encodeURIComponent(workspaceId)}`, accessToken)).presets;
}

export const listPresetsByTeam = listPresetsByWorkspace;
