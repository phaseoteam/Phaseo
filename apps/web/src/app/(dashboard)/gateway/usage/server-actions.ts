"use server";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	requireAuthenticatedUser,
	requireTeamMembership,
} from "@/utils/serverActionAuth";

async function requireAuthedTeamContext(
	supabase: Awaited<ReturnType<typeof createClient>>
) {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user?.id) throw new Error("Unauthorized");

	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id");

	await requireTeamMembership(supabase, user.id, teamId);
	return { user, teamId };
}

export interface PaginatedRequestsParams {
	timeRange: { from: string; to: string };
	modelFilter?: string | null;
	providerFilter?: string | null;
	keyFilter?: string | null;
	statusFilter?: "all" | "success" | "error";
	page: number;
	sortField: string;
	sortDirection: "asc" | "desc";
}

export interface RequestRow {
	request_id: string;
	created_at: string;
	model_id: string | null;
	provider: string | null;
	app_id: string | null;
	app_key: string | null;
	app_title: string | null;
	app_image_url: string | null;
	usage: any;
	cost_nanos: number | null;
	generation_ms: number | null;
	latency_ms: number | null;
	// PostgREST often returns `numeric` as string; treat as number-like in the UI.
	throughput: number | string | null;
	finish_reason: string | null;
	success: boolean;
	status_code: number | null;
	error_code: string | null;
	error_message: string | null;
	key_id: string | null;
}

export interface PaginatedRequestsResult {
	data: RequestRow[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * Fetch paginated requests with filters and sorting
 */
export async function fetchPaginatedRequests(
	params: PaginatedRequestsParams
): Promise<PaginatedRequestsResult> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	if (!teamId) {
		return {
			data: [],
			total: 0,
			page: params.page,
			pageSize: 100,
			totalPages: 0,
		};
	}

	const pageSize = 25;
	const offset = (params.page - 1) * pageSize;

	// Build query
	let query = supabase
		.from("gateway_requests")
		.select(
			`
			request_id,
			created_at,
			model_id,
			provider,
			app_id,
			app:api_apps!gateway_requests_app_id_fkey (
				id,
				app_key,
				title,
				image_url
			),
			usage,
			cost_nanos,
			generation_ms,
			latency_ms,
			finish_reason,
			success,
			status_code,
			error_code,
			error_message,
			key_id,
			throughput
		`,
			{ count: "exact" }
		)
		.eq("team_id", teamId)
		.gte("created_at", params.timeRange.from)
		.lte("created_at", params.timeRange.to);

	// Apply filters
	if (params.modelFilter) {
		query = query.eq("model_id", params.modelFilter);
	}
	if (params.providerFilter) {
		query = query.eq("provider", params.providerFilter);
	}
	if (params.keyFilter) {
		query = query.eq("key_id", params.keyFilter);
	}
	if (params.statusFilter === "success") {
		query = query.eq("success", true);
	} else if (params.statusFilter === "error") {
		query = query.eq("success", false);
	}

	// Apply sorting
	const sortColumn = params.sortField || "created_at";
	query = query.order(sortColumn, { ascending: params.sortDirection === "asc" });

	// Apply pagination
	query = query.range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;
	let rows = data as any[] | null;
	let totalCount = count ?? 0;
	if (error) {
		console.error("Error fetching paginated requests (with app join):", error);
		// Fallback: retry without api_apps embedded relation.
		let fallback = supabase
			.from("gateway_requests")
			.select(
				`
				request_id,
				created_at,
				model_id,
				provider,
				app_id,
				usage,
				cost_nanos,
				generation_ms,
				latency_ms,
				finish_reason,
				success,
				status_code,
				error_code,
				error_message,
				key_id,
				throughput
			`,
				{ count: "exact" },
			)
			.eq("team_id", teamId)
			.gte("created_at", params.timeRange.from)
			.lte("created_at", params.timeRange.to);

		if (params.modelFilter) fallback = fallback.eq("model_id", params.modelFilter);
		if (params.providerFilter) fallback = fallback.eq("provider", params.providerFilter);
		if (params.keyFilter) fallback = fallback.eq("key_id", params.keyFilter);
		if (params.statusFilter === "success") fallback = fallback.eq("success", true);
		else if (params.statusFilter === "error") fallback = fallback.eq("success", false);

		fallback = fallback
			.order(sortColumn, { ascending: params.sortDirection === "asc" })
			.range(offset, offset + pageSize - 1);

		const {
			data: fallbackData,
			error: fallbackError,
			count: fallbackCount,
		} = await fallback;
		if (fallbackError) {
			console.error("Error fetching paginated requests (fallback):", fallbackError);
			return {
				data: [],
				total: 0,
				page: params.page,
				pageSize,
				totalPages: 0,
			};
		}
		rows = (fallbackData as any[]) ?? [];
		totalCount = fallbackCount ?? 0;
	}

	return {
		data:
			(rows ?? []).map((row) => {
				const appRow = Array.isArray(row?.app) ? row.app[0] : row?.app;
				const appTitle =
					typeof appRow?.title === "string" && appRow.title.trim().length > 0
						? appRow.title.trim()
						: null;
				const appKey =
					typeof appRow?.app_key === "string" && appRow.app_key.trim().length > 0
						? appRow.app_key.trim()
						: null;
				const appImageUrl =
					typeof appRow?.image_url === "string" && appRow.image_url.trim().length > 0
						? appRow.image_url.trim()
						: null;
				return {
					...row,
					app_title: appTitle,
					app_key: appKey,
					app_image_url: appImageUrl,
				} as RequestRow;
			}) ?? [],
		total: totalCount,
		page: params.page,
		pageSize,
		totalPages: Math.ceil((totalCount || 0) / pageSize),
	};
}

/**
 * Fetch organization colors for models
 * Returns a map of model_id -> organization color
 */
export async function fetchOrganizationColors(
	modelIds: string[]
): Promise<Map<string, string>> {
	const { supabase } = await requireAuthenticatedUser();

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = Array.from(new Set(modelIds));
	const colorMap = new Map<string, string>();
	const normalizeApiId = (id: string) => {
		const base = id.split(":")[0];
		const dotToDash = base.replace(/\./g, "-");
		const withoutOrg = id.includes("/") ? id.split("/").slice(1).join("/") : id;
		return Array.from(new Set([id, base, dotToDash, withoutOrg])).filter(Boolean);
	};

	// 1) Direct canonical model IDs -> org colors
	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(colour)
		`
		)
		.in("model_id", uniqueModelIds);

	if (models) {
		models.forEach((m: any) => {
			if (!m.organisation?.colour) return;
			const fullId = m.model_id;
			const color = m.organisation.colour;
			const organisationId =
				typeof m?.organisation_id === "string" && m.organisation_id.trim().length > 0
					? m.organisation_id.trim()
					: null;

			colorMap.set(fullId, color);
			if (organisationId) {
				colorMap.set(organisationId, color);
				colorMap.set(organisationId.toLowerCase(), color);
			}

			if (fullId.includes("/")) {
				const withoutOrg = fullId.split("/")[1];
				colorMap.set(withoutOrg, color);

				const baseName = withoutOrg.split("-").slice(0, -3).join("-");
				if (baseName && baseName !== withoutOrg) {
					colorMap.set(baseName, color);
				}
			}
		});
	}

	// 2) API model IDs -> canonical model IDs -> org colors
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);
	const { data: providerModels } = await supabase
		.from("data_api_provider_models")
		.select("api_model_id, model_id")
		.in("api_model_id", apiLookupIds);

	const providerModelIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.model_id).filter(Boolean)),
	);
	const { data: providerCanonicalModels } = providerModelIds.length
		? await supabase
				.from("data_models")
				.select(
					`
					model_id,
					organisation_id,
					organisation:data_organisations!data_models_organisation_id_fkey(colour)
				`,
				)
				.in("model_id", providerModelIds)
		: { data: [] as any[] };

	const colorByCanonicalModelId = new Map<string, string>();
	for (const model of providerCanonicalModels ?? []) {
		if (typeof model?.model_id !== "string") continue;
		const color =
			typeof model?.organisation?.colour === "string" ? model.organisation.colour : null;
		if (!color) continue;
		colorByCanonicalModelId.set(model.model_id, color);
		const organisationId =
			typeof model?.organisation_id === "string" && model.organisation_id.trim().length > 0
				? model.organisation_id.trim()
				: null;
		if (organisationId) {
			colorMap.set(organisationId, color);
			colorMap.set(organisationId.toLowerCase(), color);
		}
	}

	const providerApiIds = new Set<string>();
	if (providerModels) {
		providerModels.forEach((pm: any) => {
			const canonicalId =
				typeof pm?.model_id === "string" && pm.model_id.trim().length > 0
					? pm.model_id
					: null;
			const color = canonicalId ? colorByCanonicalModelId.get(canonicalId) ?? null : null;
			if (!color) return;
			const apiId = pm.api_model_id ?? null;

			if (apiId) {
				providerApiIds.add(apiId);
				colorMap.set(apiId, color);
			}
			if (apiId && apiId.includes(":")) {
				colorMap.set(apiId.split(":")[0], color);
			}
			if (apiId && apiId.includes("/")) {
				const withoutOrg = apiId.split("/")[1];
				if (withoutOrg) {
					colorMap.set(withoutOrg, color);
					if (withoutOrg.includes(":")) {
						colorMap.set(withoutOrg.split(":")[0], color);
					}
				}
			}
			if (canonicalId) colorMap.set(canonicalId, color);
		});
	}

	for (const id of uniqueModelIds) {
		if (colorMap.has(id)) continue;
		const variants = normalizeApiId(id);
		const match = variants.find((v) => colorMap.has(v));
		if (match) {
			colorMap.set(id, colorMap.get(match)!);
		}
	}

	void providerApiIds;

	return colorMap;
}

/**
 * Fetch model metadata for filters
 * Returns a map of model_id -> { organisationId, organisationName, modelName? }
 */
export async function fetchModelMetadata(
	modelIds: string[]
): Promise<
	Map<
		string,
		{
			organisationId: string;
			organisationName: string;
			modelName?: string;
		}
	>
> {
	const { supabase } = await requireAuthenticatedUser();
	const metadataDebugEnabled =
		process.env.USAGE_MODEL_METADATA_DEBUG === "1" ||
		process.env.NEXT_PUBLIC_USAGE_MODEL_METADATA_DEBUG === "1";
	const metadataDebugEvents: Array<Record<string, unknown>> = [];
	const metadataDebugLog = (event: Record<string, unknown>) => {
		if (!metadataDebugEnabled) return;
		if (metadataDebugEvents.length < 300) {
			metadataDebugEvents.push(event);
		}
	};

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = Array.from(new Set(modelIds));
	const metadataMap = new Map<
		string,
		{
			organisationId: string;
			organisationName: string;
			modelName?: string;
		}
	>();

	const addMetadata = (
		key: string | null | undefined,
		value: {
			organisationId: string;
			organisationName: string;
			modelName?: string;
		},
		source?: string,
	) => {
		if (!key) return;
		const existing = metadataMap.get(key);
		if (!existing) {
			metadataMap.set(key, value);
			metadataDebugLog({
				stage: "add",
				source: source ?? "unknown",
				key,
				organisationId: value.organisationId,
				organisationName: value.organisationName,
				modelName: value.modelName ?? null,
				replaced: false,
			});
			return;
		}
		if (!existing.modelName && value.modelName) {
			metadataMap.set(key, { ...existing, modelName: value.modelName });
			metadataDebugLog({
				stage: "add",
				source: source ?? "unknown",
				key,
				organisationId: existing.organisationId,
				organisationName: existing.organisationName,
				modelName: value.modelName,
				replaced: true,
			});
		}
	};

	const normalizeApiId = (id: string) => {
		const variants = new Set<string>();
		const queue: string[] = [];

		const add = (value: string | null | undefined) => {
			const v = value?.trim();
			if (!v || variants.has(v)) return;
			variants.add(v);
			queue.push(v);
		};

		add(id);

		while (queue.length > 0) {
			const current = queue.shift()!;
			add(current.toLowerCase());
			add(current.replace(/\./g, "-"));
			if (current.includes("/")) {
				add(current.split("/").slice(1).join("/"));
			}
			if (current.includes(":")) {
				const parts = current.split(":");
				add(parts[0]);
			}
			if (/:free$/i.test(current)) {
				add(current.replace(/:free$/i, ""));
				add(current.replace(/:free$/i, "-free"));
			} else if (/-free$/i.test(current)) {
				add(current.replace(/-free$/i, ""));
				add(current.replace(/-free$/i, ":free"));
			} else {
				add(`${current}:free`);
				add(`${current}-free`);
			}
		}

		return Array.from(variants);
	};

	const deriveOrganisationId = (modelId: string | null | undefined) => {
		if (!modelId) return "unknown";
		const slashIndex = modelId.indexOf("/");
		if (slashIndex > 0) return modelId.slice(0, slashIndex);
		return modelId;
	};

	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			name,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
		`
		)
		.in("model_id", uniqueModelIds);
	if (!models) {
		console.warn(
			"Usage metadata debug: no direct model metadata rows found for unique model IDs",
		);
	}

	if (models) {
		models.forEach((m: any) => {
			const organisationId =
				typeof m?.organisation?.organisation_id === "string" && m.organisation.organisation_id
					? m.organisation.organisation_id
					: typeof m?.organisation_id === "string" && m.organisation_id
						? m.organisation_id
						: deriveOrganisationId(m?.model_id);

			const organisationName =
				typeof m?.organisation?.name === "string" && m.organisation.name
					? m.organisation.name
					: organisationId;

			const value = {
				organisationId,
				organisationName,
				modelName: typeof m?.name === "string" ? m.name : undefined,
			};

			addMetadata(m?.model_id, value, "data_models:model_id");
			if (typeof m?.model_id === "string" && m.model_id.includes("/")) {
				const withoutOrg = m.model_id.split("/").slice(1).join("/");
				addMetadata(withoutOrg, value, "data_models:without_org");
			}
		});
	}

	// Resolve API model IDs -> canonical model IDs -> names/organisation metadata.
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);

	const { data: apiModels, error: apiModelsError } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			api_model_id,
			name,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
		`,
		)
		.in("api_model_id", apiLookupIds);
	if (apiModelsError) {
		console.error(
			"Usage metadata debug: failed loading data_models by api_model_id",
			apiModelsError,
		);
	}

	for (const apiModel of apiModels ?? []) {
		const apiModelId =
			typeof apiModel?.api_model_id === "string" ? apiModel.api_model_id : null;
		if (!apiModelId) continue;
		const organisationRow = Array.isArray(apiModel?.organisation)
			? apiModel.organisation[0]
			: apiModel?.organisation;
		const organisationId =
			typeof organisationRow?.organisation_id === "string" &&
			organisationRow.organisation_id.trim().length > 0
				? organisationRow.organisation_id
				: typeof apiModel?.organisation_id === "string" &&
					  apiModel.organisation_id.trim().length > 0
				? apiModel.organisation_id
				: deriveOrganisationId(apiModelId);
		const organisationName =
			typeof organisationRow?.name === "string" &&
			organisationRow.name.trim().length > 0
				? organisationRow.name
				: organisationId;
		const modelName =
			typeof apiModel?.name === "string" && apiModel.name.trim().length > 0
				? apiModel.name
				: undefined;
		const value = { organisationId, organisationName, modelName };
		for (const variant of normalizeApiId(apiModelId)) {
			addMetadata(variant, value, `data_models:api_model_id:${apiModelId}`);
		}
		if (typeof apiModel?.model_id === "string" && apiModel.model_id.trim().length > 0) {
			addMetadata(apiModel.model_id, value, `data_models:model_id_from_api:${apiModelId}`);
		}
	}

	const providerModelSelect =
		"provider_api_model_id, api_model_id, model_id, internal_model_id, provider_model_slug";
	const [
		providerModelsByApiId,
		providerModelsByCanonicalId,
		providerModelsByInternalId,
		providerModelsBySlug,
	] = await Promise.all([
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("api_model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("internal_model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("provider_model_slug", apiLookupIds),
	]);
	if (providerModelsByApiId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by api_model_id",
			providerModelsByApiId.error,
		);
	}
	if (providerModelsByCanonicalId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by model_id",
			providerModelsByCanonicalId.error,
		);
	}
	if (providerModelsByInternalId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by internal_model_id",
			providerModelsByInternalId.error,
		);
	}
	if (providerModelsBySlug.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by provider_model_slug",
			providerModelsBySlug.error,
		);
	}

	const providerModelsMap = new Map<string, any>();
	for (const row of [
		...(providerModelsByApiId.data ?? []),
		...(providerModelsByCanonicalId.data ?? []),
		...(providerModelsByInternalId.data ?? []),
		...(providerModelsBySlug.data ?? []),
	]) {
		const id =
			typeof row?.provider_api_model_id === "string" && row.provider_api_model_id.trim().length > 0
				? row.provider_api_model_id
				: `${row?.api_model_id ?? ""}::${row?.model_id ?? ""}::${row?.provider_model_slug ?? ""}`;
		if (!providerModelsMap.has(id)) {
			providerModelsMap.set(id, row);
		}
	}
	const providerModels = Array.from(providerModelsMap.values());

	const canonicalIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.model_id).filter(Boolean)),
	);
	const canonicalInternalIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.internal_model_id).filter(Boolean)),
	);
	const canonicalApiIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.api_model_id).filter(Boolean)),
	);
	const canonicalModelIds = Array.from(
		new Set([...canonicalIds, ...canonicalInternalIds].filter(Boolean)),
	);
	const [canonicalModelsByIdResult, canonicalModelsByApiResult] = await Promise.all([
		canonicalModelIds.length
			? supabase
					.from("data_models")
					.select(
						`
						model_id,
						api_model_id,
						name,
						organisation_id,
						organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
					`,
					)
					.in("model_id", canonicalModelIds)
			: Promise.resolve({ data: [] as any[], error: null }),
		canonicalApiIds.length
			? supabase
					.from("data_models")
					.select(
						`
						model_id,
						api_model_id,
						name,
						organisation_id,
						organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
					`,
					)
					.in("api_model_id", canonicalApiIds)
			: Promise.resolve({ data: [] as any[], error: null }),
	]);
	if (canonicalModelsByIdResult.error) {
		console.error(
			"Usage metadata debug: failed loading canonical models by model_id",
			canonicalModelsByIdResult.error,
		);
	}
	if (canonicalModelsByApiResult.error) {
		console.error(
			"Usage metadata debug: failed loading canonical models by api_model_id",
			canonicalModelsByApiResult.error,
		);
	}
	const canonicalModelMap = new Map<string, any>();
	for (const model of [
		...(canonicalModelsByIdResult.data ?? []),
		...(canonicalModelsByApiResult.data ?? []),
	]) {
		if (typeof model?.model_id === "string") {
			for (const variant of normalizeApiId(model.model_id)) {
				if (!canonicalModelMap.has(variant)) {
					canonicalModelMap.set(variant, model);
				}
			}
		}
		if (typeof model?.api_model_id === "string") {
			for (const variant of normalizeApiId(model.api_model_id)) {
				if (!canonicalModelMap.has(variant)) {
					canonicalModelMap.set(variant, model);
				}
			}
		}
	}

	if (providerModels.length > 0) {
		providerModels.forEach((pm: any) => {
			const apiId: string | null = typeof pm?.api_model_id === "string" ? pm.api_model_id : null;
			const canonicalId: string | null =
				typeof pm?.model_id === "string" ? pm.model_id : null;
			const internalModelId: string | null =
				typeof pm?.internal_model_id === "string" ? pm.internal_model_id : null;
			const providerModelSlug: string | null =
				typeof pm?.provider_model_slug === "string" ? pm.provider_model_slug : null;
			const metadataCandidates = [
				apiId,
				canonicalId,
				internalModelId,
				providerModelSlug,
			].filter(Boolean) as string[];
			if (metadataCandidates.length === 0) return;
			const canonicalModel =
				metadataCandidates
					.flatMap((candidate) => normalizeApiId(candidate))
					.map((candidate) => canonicalModelMap.get(candidate))
					.find(Boolean) ?? null;

			const matchedMetadataKey = metadataCandidates
				.flatMap((candidate) => normalizeApiId(candidate))
				.find((candidate) => metadataMap.has(candidate));
			const matchedMetadata = matchedMetadataKey
				? metadataMap.get(matchedMetadataKey)
				: null;
			const fallbackSourceId =
				canonicalId ?? internalModelId ?? apiId ?? providerModelSlug;
			const hasTrustedOrigin = Boolean(canonicalModel || matchedMetadata);
			const isUntrustedDerivedOrigin =
				!hasTrustedOrigin &&
				typeof fallbackSourceId === "string" &&
				!fallbackSourceId.includes("/");
			if (isUntrustedDerivedOrigin) {
				metadataDebugLog({
					stage: "provider_resolution_skipped",
					apiId,
					canonicalId,
					internalModelId,
					providerModelSlug,
					reason: "untrusted_derived_origin",
				});
				return;
			}

			const organisationId =
				typeof canonicalModel?.organisation?.organisation_id === "string" &&
				canonicalModel.organisation.organisation_id
					? canonicalModel.organisation.organisation_id
					: matchedMetadata?.organisationId ??
						deriveOrganisationId(fallbackSourceId);

			const organisationName =
				typeof canonicalModel?.organisation?.name === "string" &&
				canonicalModel.organisation.name
					? canonicalModel.organisation.name
					: matchedMetadata?.organisationName ?? organisationId;

			const value = {
				organisationId,
				organisationName,
				modelName:
					typeof canonicalModel?.name === "string" && canonicalModel.name.trim().length > 0
						? canonicalModel.name
						: matchedMetadata?.modelName,
			};

			for (const candidate of metadataCandidates) {
				for (const variant of normalizeApiId(candidate)) {
					addMetadata(
						variant,
						value,
						`provider_models:${apiId ?? "null"}:${canonicalId ?? "null"}:${providerModelSlug ?? "null"}`,
					);
				}
			}
			metadataDebugLog({
				stage: "provider_resolution",
				apiId,
				canonicalId,
				internalModelId,
				providerModelSlug,
				matchedMetadataKey: matchedMetadataKey ?? null,
				chosenOrganisationId: value.organisationId,
				chosenOrganisationName: value.organisationName,
				chosenModelName: value.modelName ?? null,
				candidates: metadataCandidates,
			});
		});
	}

	for (const id of uniqueModelIds) {
		if (metadataMap.has(id)) continue;
		const variants = normalizeApiId(id);
		const match = variants.find((variant) => metadataMap.has(variant));
		if (match) {
			metadataMap.set(id, metadataMap.get(match)!);
			metadataDebugLog({
				stage: "finalize",
				modelId: id,
				matchedVariant: match,
				resolution: metadataMap.get(match) ?? null,
			});
		} else {
			metadataDebugLog({
				stage: "finalize",
				modelId: id,
				matchedVariant: null,
				resolution: null,
			});
		}
	}

	if (metadataDebugEnabled) {
		const summary = uniqueModelIds.map((id) => {
			const variants = normalizeApiId(id);
			const matchedVariant = variants.find((variant) => metadataMap.has(variant)) ?? null;
			const resolved = matchedVariant ? metadataMap.get(matchedVariant) ?? null : null;
			return {
				modelId: id,
				matchedVariant,
				organisationId: resolved?.organisationId ?? null,
				organisationName: resolved?.organisationName ?? null,
				modelName: resolved?.modelName ?? null,
			};
		});
		console.log(
			"Usage metadata debug summary",
			JSON.stringify(
				{
					inputCount: uniqueModelIds.length,
					apiLookupCount: apiLookupIds.length,
					apiModelsCount: apiModels?.length ?? 0,
					providerModelsCount: providerModels.length,
					summary,
					events: metadataDebugEvents,
				},
				null,
				2,
			),
		);
	}

	return metadataMap;
}
/**
 * Fetch provider names for display labels
 * Returns a map of provider_id -> provider name
 */
export async function fetchProviderNames(
	providerIds: string[]
): Promise<Map<string, string>> {
	const { supabase } = await requireAuthenticatedUser();

	if (providerIds.length === 0) {
		return new Map();
	}

	const uniqueProviderIds = Array.from(new Set(providerIds.filter(Boolean)));
	const { data: providers } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name")
		.in("api_provider_id", uniqueProviderIds);

	const providerNameMap = new Map<string, string>();

	if (providers) {
		providers.forEach((provider: any) => {
			if (!provider?.api_provider_id) return;
			providerNameMap.set(
				provider.api_provider_id,
				provider.api_provider_name || provider.api_provider_id
			);
		});
	}

	return providerNameMap;
}

/**
 * Fetch fun stats and insights
 */
export interface FunStatsResult {
	topModel: { name: string; requests: number } | null;
	topProvider: { name: string; requests: number } | null;
	mostExpensive: { name: string; cost: number } | null;
	fastestModel: { name: string; speedMs: number } | null;
}

export async function fetchFunStats(
	timeRange: { from: string; to: string }
): Promise<FunStatsResult> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	if (!teamId) {
		return {
			topModel: null,
			topProvider: null,
			mostExpensive: null,
			fastestModel: null,
		};
	}

	const { data: rows } = await supabase
		.from("gateway_usage_rollup_15m_team_provider_model")
		.select(
			"canonical_model_id, provider, requests, total_cost_nanos, latency_sum_ms, latency_samples",
		)
		.eq("team_id", teamId)
		.gte("bucket_15m", timeRange.from)
		.lte("bucket_15m", timeRange.to);

	if (!rows || rows.length === 0) {
		return {
			topModel: null,
			topProvider: null,
			mostExpensive: null,
			fastestModel: null,
		};
	}

	// Top model by requests
	const modelCounts = new Map<string, number>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const requests = Number(r.requests ?? 0) || 0;
		modelCounts.set(model, (modelCounts.get(model) || 0) + requests);
	});
	const topModelEntry = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topModel = topModelEntry
		? { name: topModelEntry[0], requests: topModelEntry[1] }
		: null;

	// Top provider by requests
	const providerCounts = new Map<string, number>();
	rows.forEach((r: any) => {
		const provider = r.provider || "unknown";
		const requests = Number(r.requests ?? 0) || 0;
		providerCounts.set(provider, (providerCounts.get(provider) || 0) + requests);
	});
	const topProviderEntry = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topProvider = topProviderEntry
		? { name: topProviderEntry[0], requests: topProviderEntry[1] }
		: null;

	// Most expensive model
	const modelCosts = new Map<string, number>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const cost = Number(r.total_cost_nanos ?? 0) / 1e9;
		modelCosts.set(model, (modelCosts.get(model) || 0) + cost);
	});
	const mostExpensiveEntry = Array.from(modelCosts.entries()).sort((a, b) => b[1] - a[1])[0];
	const mostExpensive = mostExpensiveEntry
		? { name: mostExpensiveEntry[0], cost: mostExpensiveEntry[1] }
		: null;

	// Fastest model (average latency)
	const modelLatencySums = new Map<string, { sum: number; samples: number }>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const latencySum = Number(r.latency_sum_ms ?? 0) || 0;
		const latencySamples = Number(r.latency_samples ?? 0) || 0;
		if (latencySamples <= 0 || latencySum <= 0) return;
		const current = modelLatencySums.get(model) ?? { sum: 0, samples: 0 };
		current.sum += latencySum;
		current.samples += latencySamples;
		modelLatencySums.set(model, current);
	});
	const modelAvgLatencies = Array.from(modelLatencySums.entries())
		.map(([model, values]) => ({
			model,
			avg: values.samples > 0 ? values.sum / values.samples : Number.POSITIVE_INFINITY,
		}))
		.filter((entry) => Number.isFinite(entry.avg) && entry.avg > 0)
		.sort((a, b) => a.avg - b.avg);
	const fastestModel = modelAvgLatencies[0]
		? { name: modelAvgLatencies[0].model, speedMs: Math.round(modelAvgLatencies[0].avg) }
		: null;

	return {
		topModel,
		topProvider,
		mostExpensive,
		fastestModel,
	};
}

/**
 * Fetch app names
 * Returns a map of app_id -> app title
 */
export async function fetchAppNames(appIds: string[]): Promise<Map<string, string>> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	if (!teamId || appIds.length === 0) {
		return new Map();
	}

	const { data: apps } = await supabase
		.from("api_apps")
		.select("id, title")
		.eq("team_id", teamId)
		.in("id", appIds);

	const appMap = new Map<string, string>();

	if (apps) {
		apps.forEach((app: any) => {
			appMap.set(app.id, app.title);
		});
	}

	return appMap;
}

/**
 * Investigate a generation by request_id
 * Uses team authentication - no API key required
 */
export async function investigateGeneration(
	requestId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	if (!teamId) {
		return {
			success: false,
			error: "Not authenticated",
		};
	}

	if (!requestId.trim()) {
		return {
			success: false,
			error: "Request ID required",
		};
	}

	const { data, error } = await supabase
		.from("gateway_requests")
		.select("*")
		.eq("team_id", teamId)
		.eq("request_id", requestId.trim())
		.single();

	if (error) {
		if (error.code === "PGRST116") {
			return {
				success: false,
				error: "Request not found or not authorized",
			};
		}
		return {
			success: false,
			error: error.message || "Failed to fetch request",
		};
	}

	return {
		success: true,
		data,
	};
}

/**
 * Fetch chart data grouped by provider
 * Returns data for requests, tokens, and cost metrics
 */
export interface ChartDataParams {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	keyFilter?: string | null;
}

export interface ProviderMetrics {
	requests: number;
	tokens: number;
	cost: number;
	models: Map<string, { requests: number; tokens: number; cost: number }>;
}

export interface ChartDataPoint {
	bucket: string;
	[provider: string]: number | string;
}

export interface ChartDataResult {
	// Chart data grouped by provider
	requestsChart: ChartDataPoint[];
	tokensChart: ChartDataPoint[];
	costChart: ChartDataPoint[];
	// Provider breakdown with model details
	providerBreakdown: Map<string, ProviderMetrics>;
	// Totals and averages
	totals: {
		requests: { current: number; previous: number; avg: number };
		tokens: { current: number; previous: number; avg: number };
		cost: { current: number; previous: number; avg: number };
	};
}

export async function fetchChartData(
	params: ChartDataParams
): Promise<ChartDataResult> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	if (!teamId) {
		return {
			requestsChart: [],
			tokensChart: [],
			costChart: [],
			providerBreakdown: new Map(),
			totals: {
				requests: { current: 0, previous: 0, avg: 0 },
				tokens: { current: 0, previous: 0, avg: 0 },
				cost: { current: 0, previous: 0, avg: 0 },
			},
		};
	}

	const bucketKey = (() => {
		if (params.range === "1h") return "5min";
		if (params.range === "1d") return "hour";
		if (params.range === "1y") return "month";
		return "day";
	})();

	const toFiniteNumber = (value: unknown): number => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return 0;
	};

	const usageTokens = (usage: unknown): number => {
		if (!usage || typeof usage !== "object" || Array.isArray(usage)) return 0;
		const usageRecord = usage as Record<string, unknown>;
		const totalTokens = toFiniteNumber(usageRecord.total_tokens);
		if (totalTokens > 0) return totalTokens;
		const inputTokens = toFiniteNumber(
			usageRecord.input_tokens ?? usageRecord.input_text_tokens ?? usageRecord.prompt_tokens,
		);
		const outputTokens = toFiniteNumber(
			usageRecord.output_tokens ??
				usageRecord.output_text_tokens ??
				usageRecord.completion_tokens,
		);
		return inputTokens + outputTokens;
	};

	const floorToRollupBucket = (date: Date, bucket: string): Date => {
		const d = new Date(date);
		if (bucket === "5min") {
			d.setSeconds(0, 0);
			d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
			return d;
		}
		if (bucket === "hour") {
			d.setMinutes(0, 0, 0);
			return d;
		}
		if (bucket === "day") {
			d.setHours(0, 0, 0, 0);
			return d;
		}
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	const fetchGatewayRequestFallbackRows = async (
		fromIso: string,
		toIso: string,
	): Promise<any[]> => {
		const pageSize = 1000;
		const maxPages = 200;
		const merged = new Map<
			string,
			{
				bucket: string;
				provider: string;
				model_id: string;
				requests: number;
				tokens: number;
				cost: number;
			}
		>();

		for (let page = 0; page < maxPages; page += 1) {
			const from = page * pageSize;
			const to = from + pageSize - 1;
			let query = supabase
				.from("gateway_requests")
				.select("created_at, provider, model_id, usage, cost_nanos")
				.eq("team_id", teamId)
				.gte("created_at", fromIso)
				.lte("created_at", toIso)
				.order("created_at", { ascending: true })
				.range(from, to);

			if (params.keyFilter) {
				query = query.eq("key_id", params.keyFilter);
			}

			const { data, error } = await query;
			if (error) {
				console.error("Error fetching gateway request usage fallback:", error);
				return [];
			}

			const batch = data ?? [];
			for (const row of batch as any[]) {
				const createdAt =
					typeof row?.created_at === "string" ? new Date(row.created_at) : null;
				if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
				const bucketDate = floorToRollupBucket(createdAt, bucketKey);
				const bucketIso = bucketDate.toISOString();
				const provider =
					typeof row?.provider === "string" && row.provider.trim().length > 0
						? row.provider.trim()
						: "unknown";
				const modelId =
					typeof row?.model_id === "string" && row.model_id.trim().length > 0
						? row.model_id.trim()
						: "unknown";
				const rowTokens = usageTokens(row?.usage);
				const rowCost = toFiniteNumber(row?.cost_nanos) / 1e9;
				const key = `${bucketIso}::${provider}::${modelId}`;
				const existing = merged.get(key);
				if (!existing) {
					merged.set(key, {
						bucket: bucketIso,
						provider,
						model_id: modelId,
						requests: 1,
						tokens: rowTokens,
						cost: rowCost,
					});
					continue;
				}
				existing.requests += 1;
				existing.tokens += rowTokens;
				existing.cost += rowCost;
			}

			if (batch.length < pageSize) {
				break;
			}
		}

		return Array.from(merged.values()).sort(
			(a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime(),
		);
	};

	// Fetch current period data (aggregated)
	const { data: rows, error: rollupError } = await supabase.rpc(
		"get_usage_chart_rollup",
		{
			p_team: teamId,
			p_from: params.timeRange.from,
			p_to: params.timeRange.to,
			p_bucket: bucketKey,
			p_key_id: params.keyFilter ?? null,
		},
	);
	if (rollupError) {
		console.error("Error fetching usage rollup:", rollupError);
	}

	// Fetch previous period for comparison (aggregated)
	const fromDate = new Date(params.timeRange.from);
	const toDate = new Date(params.timeRange.to);
	const windowMs = toDate.getTime() - fromDate.getTime();
	const prevFrom = new Date(fromDate.getTime() - windowMs).toISOString();
	const prevTo = fromDate.toISOString();
	const { data: prevRows, error: prevError } = await supabase.rpc(
		"get_usage_chart_rollup",
		{
			p_team: teamId,
			p_from: prevFrom,
			p_to: prevTo,
			p_bucket: bucketKey,
			p_key_id: params.keyFilter ?? null,
		},
	);
	if (prevError) {
		console.error("Error fetching usage rollup (prev):", prevError);
	}
	let currentRows = (rows ?? []) as any[];
	if (currentRows.length === 0) {
		currentRows = await fetchGatewayRequestFallbackRows(
			params.timeRange.from,
			params.timeRange.to,
		);
	}
	let previousRows = (prevRows ?? []) as any[];
	if (previousRows.length === 0) {
		previousRows = await fetchGatewayRequestFallbackRows(prevFrom, prevTo);
	}


	// Helper functions
	function bucketFor(d: Date, range: string): string {
		const pad = (n: number) => String(n).padStart(2, "0");
		if (range === "1h") {
			const minutes = Math.floor(d.getMinutes() / 5) * 5;
			return `${pad(d.getHours())}:${pad(minutes)}`;
		}
		if (range === "1d") return `${pad(d.getHours())}:00`;
		if (range === "1m" || range === "1w")
			return d.toLocaleDateString(undefined, {
				month: "short",
				day: "2-digit",
			});
		return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
	}

	function floorToBucketStart(date: Date, range: string): Date {
		const d = new Date(date);
		if (range === "1h") {
			d.setSeconds(0, 0);
			d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
			return d;
		}
		if (range === "1d") {
			d.setMinutes(0, 0, 0);
			return d;
		}
		if (range === "1m" || range === "1w") {
			d.setHours(0, 0, 0, 0);
			return d;
		}
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	function advanceBucket(date: Date, range: string) {
		if (range === "1h") {
			date.setMinutes(date.getMinutes() + 5);
			return;
		}
		if (range === "1d") {
			date.setHours(date.getHours() + 1);
			return;
		}
		if (range === "1m" || range === "1w") {
			date.setDate(date.getDate() + 1);
			return;
		}
		date.setMonth(date.getMonth() + 1);
	}

	function buildExpectedBuckets(fromIso: string, toIso: string, range: string): string[] {
		const from = new Date(fromIso);
		const to = new Date(toIso);
		const cursor = floorToBucketStart(from, range);
		const labels: string[] = [];
		let safety = 0;
		while (cursor.getTime() <= to.getTime() && safety < 10000) {
			labels.push(bucketFor(cursor, range));
			advanceBucket(cursor, range);
			safety += 1;
		}
		return labels;
	}

	// Build provider breakdown and chart data
	const providerBreakdown = new Map<string, ProviderMetrics>();
	const requestsBuckets = new Map<string, Map<string, number>>();
	const tokensBuckets = new Map<string, Map<string, number>>();
	const costBuckets = new Map<string, Map<string, number>>();
	const expectedBuckets = buildExpectedBuckets(
		params.timeRange.from,
		params.timeRange.to,
		params.range,
	);

	for (const bucket of expectedBuckets) {
		requestsBuckets.set(bucket, new Map());
		tokensBuckets.set(bucket, new Map());
		costBuckets.set(bucket, new Map());
	}

	currentRows.forEach((row: any) => {
		const provider = row.provider || "unknown";
		const modelId = row.model_id || "unknown";
		const bucket = bucketFor(new Date(row.bucket), params.range);
		const requests = Number(row.requests ?? 0) || 0;
		const tokens = Number(row.tokens ?? 0) || 0;
		const cost = Number(row.cost ?? 0) || 0;

		// Update provider breakdown
		if (!providerBreakdown.has(provider)) {
			providerBreakdown.set(provider, {
				requests: 0,
				tokens: 0,
				cost: 0,
				models: new Map(),
			});
		}

		const providerMetrics = providerBreakdown.get(provider)!;
		providerMetrics.requests += requests;
		providerMetrics.tokens += tokens;
		providerMetrics.cost += cost;

		if (!providerMetrics.models.has(modelId)) {
			providerMetrics.models.set(modelId, { requests: 0, tokens: 0, cost: 0 });
		}

		const modelMetrics = providerMetrics.models.get(modelId)!;
		modelMetrics.requests += requests;
		modelMetrics.tokens += tokens;
		modelMetrics.cost += cost;

		// Update chart buckets (group by MODEL instead of provider for correct colors)
		if (!requestsBuckets.has(bucket)) requestsBuckets.set(bucket, new Map());
		if (!tokensBuckets.has(bucket)) tokensBuckets.set(bucket, new Map());
		if (!costBuckets.has(bucket)) costBuckets.set(bucket, new Map());

		const reqBucket = requestsBuckets.get(bucket)!;
		const tokBucket = tokensBuckets.get(bucket)!;
		const costBucket = costBuckets.get(bucket)!;

		reqBucket.set(modelId, (reqBucket.get(modelId) || 0) + requests);
		tokBucket.set(modelId, (tokBucket.get(modelId) || 0) + tokens);
		costBucket.set(modelId, (costBucket.get(modelId) || 0) + cost);
	});

	// Convert to chart format (now using model_id as keys for correct org colors)
	const requestsChart = Array.from(requestsBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	const tokensChart = Array.from(tokensBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	const costChart = Array.from(costBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	// Calculate totals
	const currentRequests = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const currentTokens = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const currentCost = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.cost ?? 0) || 0),
		0,
	);

	const previousRequests = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const previousTokens = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const previousCost = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.cost ?? 0) || 0),
		0,
	);

	const bucketCount = requestsChart.length || 1;
	const avgRequests = currentRequests / bucketCount;
	const avgTokens = currentTokens / bucketCount;
	const avgCost = currentCost / bucketCount;

	return {
		requestsChart,
		tokensChart,
		costChart,
		providerBreakdown,
		totals: {
			requests: { current: currentRequests, previous: previousRequests, avg: avgRequests },
			tokens: { current: currentTokens, previous: previousTokens, avg: avgTokens },
			cost: { current: currentCost, previous: previousCost, avg: avgCost },
		},
	};
}

export interface SessionRollupParams {
	timeRange: { from: string; to: string };
	limit?: number;
	offset?: number;
	appId?: string | null;
	modelId?: string | null;
	provider?: string | null;
}

export interface SessionRollupRow {
	session_id: string;
	request_count: number;
	total_cost_nanos: number;
	total_cost_usd: number;
	first_request_at: string;
	last_request_at: string;
	app_ids: string[] | null;
	model_ids: string[] | null;
	provider_ids: string[] | null;
	end_user_ids: string[] | null;
}

export async function fetchSessionRollups(
	params: SessionRollupParams,
): Promise<SessionRollupRow[]> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	const { data, error } = await supabase.rpc("get_gateway_sessions_rollup", {
		p_team: teamId,
		p_from: params.timeRange.from,
		p_to: params.timeRange.to,
		p_limit: params.limit ?? 100,
		p_offset: params.offset ?? 0,
		p_app_id: params.appId ?? null,
		p_model_id: params.modelId ?? null,
		p_provider: params.provider ?? null,
	});

	if (error) {
		console.error("Error fetching session rollups:", error);
		return [];
	}

	return (data ?? []) as SessionRollupRow[];
}

export interface JobsRollupParams {
	limit?: number;
	offset?: number;
	kind?: "video" | "batch" | "music" | null;
	status?: string | null;
	sessionId?: string | null;
	provider?: string | null;
}

export interface JobsRollupRow {
	job_id: string;
	kind: string;
	internal_id: string;
	request_id: string | null;
	session_id: string | null;
	app_id: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	billed_at: string | null;
	created_at: string;
	updated_at: string;
	request_created_at: string | null;
	request_endpoint: string | null;
	request_model_id: string | null;
	request_cost_nanos: number | null;
	request_cost_usd: number | null;
}

export async function fetchJobsRollups(
	params: JobsRollupParams = {},
): Promise<JobsRollupRow[]> {
	const supabase = await createClient();
	const { teamId } = await requireAuthedTeamContext(supabase);

	const { data, error } = await supabase.rpc("get_gateway_jobs_rollup", {
		p_team: teamId,
		p_limit: params.limit ?? 100,
		p_offset: params.offset ?? 0,
		p_kind: params.kind ?? null,
		p_status: params.status ?? null,
		p_session_id: params.sessionId ?? null,
		p_provider: params.provider ?? null,
	});

	if (error) {
		console.error("Error fetching jobs rollups:", error);
		return [];
	}

	return (data ?? []) as JobsRollupRow[];
}

