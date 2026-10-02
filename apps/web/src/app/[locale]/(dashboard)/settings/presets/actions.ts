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
		effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
		max_tokens?: number;
		exclude_from_output?: boolean;
	};
	provider_preferences?: Record<string, number>;
};

export type PresetVisibility = "private" | "team" | "public";
export type PresetVersioningMethod = "sequential" | "semver" | "date";

export type CreatePresetInput = {
	name: string;
	slug?: string;
	description?: string;
	creatorUserId: string;
	workspaceId: string;
	config: PresetConfig;
	visibility?: PresetVisibility;
	versioningMethod?: PresetVersioningMethod;
};

export type UpdatePresetInput = {
	id: string;
	name?: string;
	slug?: string;
	description?: string;
	config?: Partial<PresetConfig>;
	visibility?: PresetVisibility;
	versioningMethod?: PresetVersioningMethod;
};

function validatePresetName(name: string): void {
	if (!name || typeof name !== "string") {
		throw new Error("Preset name is required");
	}

	const trimmedName = name.trim();
	if (trimmedName.length > 120) throw new Error("Preset name must be 120 characters or fewer");
	if (/\p{C}/u.test(trimmedName)) throw new Error("Preset name contains unsupported characters");
}

function normalizePresetSlug(value: string): string {
	return value.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._:-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-._:]+|[-._:]+$/g, "");
}

function sanitizeConfig(config: PresetConfig): Record<string, unknown> {
	const managedKeys = new Set([
		"system_prompt",
		"models",
		"only_providers",
		"ignore_providers",
		"provider",
		"plugins",
		"routing_mode",
		"provider_preferences",
		"response_caching",
		"parameters",
		"reasoning",
	]);
	const sanitized: Record<string, unknown> = Object.fromEntries(
		Object.entries(config).filter(([key]) => !managedKeys.has(key)),
	);

	if (typeof config.system_prompt === "string" && config.system_prompt.trim()) {
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

	if (config.provider_preferences && typeof config.provider_preferences === "object") {
		const preferences = Object.fromEntries(
			Object.entries(config.provider_preferences).filter(
				([, weight]) => Number.isFinite(weight) && weight > 0,
			),
		);
		if (Object.keys(preferences).length > 0) {
			sanitized.provider_preferences = preferences;
		}
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

		if (reasoning.effort && ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(reasoning.effort)) {
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
	const { name, slug, description, creatorUserId, workspaceId, config, visibility } = input;

	if (!creatorUserId || typeof creatorUserId !== "string") {
		throw new Error("Creator user ID is required");
	}
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Workspace ID is required");
	}

	validatePresetName(name);
	const normalizedSlug = normalizePresetSlug(slug || name);
	if (!normalizedSlug) throw new Error("Preset slug is required");

	const sanitizedConfig = sanitizeConfig(config);
	const normalizedVisibility = normalizeVisibility(visibility);
	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	const data = await fetchAccountWebApi<{ id?: string; name: string; createdAt?: string }>("/api/account/settings/presets", accessToken, { method: "POST", body: JSON.stringify({ workspaceId, name: name.trim(), slug: normalizedSlug, description, config: sanitizedConfig, visibility: normalizedVisibility }) });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(data.id ?? null);
	return data;
}

export async function ensureWorkspacePresetPublisherAction(workspaceId: string, handle: string) {
	const normalized = normalizePresetSlug(handle).replace(/[.:]/g, "-");
	if (normalized.length < 3 || normalized.length > 40) throw new Error("Publisher handle must be between 3 and 40 characters");
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi("/api/account/settings/presets/publisher", accessToken, {
		method: "PUT",
		body: JSON.stringify({ workspaceId, handle: normalized }),
	});
	revalidatePath("/settings/presets");
	return { handle: normalized };
}

export async function forkPresetAction(sourcePresetId: string, sourceVersionId?: string) {
	if (!sourcePresetId || typeof sourcePresetId !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		throw new Error("WORKSPACE_REQUIRED");
	}
	if (!context.accessToken) throw new Error("AUTH_REQUIRED");
	let data: { id?: string; name: string; slug?: string };
	try {
		data = await fetchAccountWebApi<{ id?: string; name: string; slug?: string }>(`/api/account/settings/presets/${encodeURIComponent(sourcePresetId)}/fork`, context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId, sourceVersionId }) });
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		if (code === "invalid_source_version" || code === "not_public") throw new Error("That preset version is no longer available to fork.");
		throw error;
	}

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(sourcePresetId);
	if (data.id) {
		revalidatePresetDataCache(data.id);
	}
	return data;
}

export async function updatePresetAction(input: UpdatePresetInput) {
	const { id, name, slug, description, config, visibility } = input;

	if (!id || typeof id !== "string") {
		throw new Error("Valid preset ID is required");
	}

	const updateObj: Record<string, unknown> = {};

	if (name) {
		validatePresetName(name);

		updateObj.name = name.trim();
	}
	if (slug !== undefined) {
		const normalizedSlug = normalizePresetSlug(slug);
		if (!normalizedSlug) throw new Error("Preset slug is required");
		updateObj.slug = normalizedSlug;
	}

	if (description !== undefined) {
		updateObj.description = description?.trim().substring(0, 500) || null;
	}

	if (config !== undefined) {
		updateObj.config = sanitizeConfig(config as PresetConfig);
		updateObj.replaceConfig = true;
	}

	if (visibility) {
		updateObj.visibility = normalizeVisibility(visibility);
	}
	if (input.versioningMethod && ["sequential", "semver", "date"].includes(input.versioningMethod)) updateObj.versioningMethod = input.versioningMethod;

	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/settings/presets/${encodeURIComponent(id)}`, accessToken, { method: "PUT", body: JSON.stringify(updateObj) });

	revalidatePath("/settings/presets");
	revalidatePresetDataCache(id);

	return { success: true };
}

export async function publishPresetVersionAction(id: string, releaseNotes?: string, versionLabel?: string) {
	if (!id) throw new Error("Valid preset ID is required");
	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	let data: { version?: { version_number?: number; version_label?: string } };
	try {
		data = await fetchAccountWebApi<{ version?: { version_number?: number; version_label?: string } }>(`/api/account/settings/presets/${encodeURIComponent(id)}/versions`, accessToken, { method: "POST", body: JSON.stringify({ releaseNotes, versionLabel }) });
	} catch (error) {
		if (error instanceof Error && error.message === "no_draft_changes") throw new Error("Save a draft change before publishing a new version.");
		throw error;
	}
	revalidatePath("/settings/presets"); revalidatePath(`/gateway/marketplace/${id}`); revalidatePresetDataCache(id);
	return data;
}

export async function applyPresetUpstreamVersionAction(id: string, versionId: string) {
	if (!id || !versionId) throw new Error("Preset and version are required");
	const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized");
	try {
		await fetchAccountWebApi(`/api/account/settings/presets/${encodeURIComponent(id)}/upstream`, accessToken, { method: "POST", body: JSON.stringify({ versionId }) });
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		if (code === "preset_has_local_draft_changes") throw new Error("Publish or discard your draft changes before applying the upstream version.");
		if (code === "upstream_version_unavailable") throw new Error("That upstream version is no longer publicly available.");
		throw error;
	}
	revalidatePath("/settings/presets"); revalidatePresetDataCache(id);
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
