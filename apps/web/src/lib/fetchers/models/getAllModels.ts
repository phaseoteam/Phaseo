// lib/fetchers/models/getAllModels.ts
import { cacheLife, cacheTag } from "next/cache";
import {
	MODEL_LIST_TAGS,
	PUBLIC_MODEL_CATALOGUE_CACHE_LIFE,
} from "@/lib/cache/publicModelCatalogueTags";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyHiddenFilter } from "./visibility";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";
import {
	type GatewaySupportedModel,
	getGatewaySupportedModels,
} from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import {
	type MonitorModelData,
	getMonitorModels,
} from "@/lib/fetchers/models/table-view/getMonitorModels";
import {
	parseModelPageNoticeRow,
	type ModelPageNotice,
} from "@/lib/fetchers/models/getModelPageNotice";

export interface ModelCard {
    model_id: string;
    name: string;
    organisation_id: string;
    organisation_name: string | null;
    organisation_colour: string | null;
    status?: string | null;
    hidden?: boolean;
    release_date?: string | null;
    announcement_date?: string | null;
    updated_at?: string | null;
    api_model_id?: string | null;
    input_types?: string[];
    output_types?: string[];
    // Backward-compatibility alias used in some legacy call sites
    input_modalities?: string[];
    output_modalities?: string[];
    primary_date: string | null;
    primary_timestamp: number | null;
    primary_group_key: string | null;
    model_source?: "api_backed" | "internal_only";
    gateway_status?: "active" | "coming_soon" | "inactive" | "not_listed";
    gateway_provider_count?: number;
    gateway_active_provider_count?: number;
    gateway_endpoints?: string[];
    gateway_input_modalities?: string[];
    gateway_output_modalities?: string[];
    gateway_features?: string[];
    gateway_tiers?: string[];
    gateway_provider_ids?: string[];
    gateway_provider_names?: string[];
    gateway_active_provider_names?: string[];
    gateway_execution_regions?: string[];
    gateway_provider_details?: Array<{
        id: string;
        name: string;
        is_active: boolean;
        status?: string | null;
    }>;
    gateway_api_model_ids?: string[];
    context_lengths?: number[];
    supported_parameters?: string[];
    lowest_input_price?: number | null;
    lowest_output_price?: number | null;
    lowest_standard_input_price?: number | null;
    lowest_standard_output_price?: number | null;
    lowest_standard_input_price_label?: string | null;
    lowest_standard_input_price_unit?: string | null;
    lowest_standard_output_price_label?: string | null;
    lowest_standard_output_price_unit?: string | null;
    lowest_from_price?: number | null;
    lowest_from_price_unit?: string | null;
    pricing_detail_rows?: Array<{
        label: string;
        value: string;
    }>;
    popularity_tokens_week?: number | null;
    throughput_week?: number | null;
    latency_week?: number | null;
    model_page_notice?: ModelPageNotice | null;
    gateway_supported_models?: GatewaySupportedModel[];
    gateway_monitor_rows?: MonitorModelData[];
}

const ACTIVE_GATEWAY_STATUSES = new Set([
    "active",
    "deranked_lvl1",
    "deranked_lvl2",
    "deranked_lvl3",
]);

const GATEWAY_STATUS_PRIORITY = [
    "active",
    "coming_soon",
    "deranked_lvl1",
    "deranked_lvl2",
    "deranked_lvl3",
    "inactive",
    "disabled",
] as const;

function normalizeGatewayStatus(value: unknown): string {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!normalized) return "inactive";
    if (normalized === "not_active") return "inactive";
    if (normalized === "comingsoon") return "coming_soon";
    if (normalized === "deranked" || normalized === "de_ranked") {
        return "deranked_lvl1";
    }
    if (normalized === "deranked_lvl_1") return "deranked_lvl1";
    if (normalized === "deranked_lvl_2") return "deranked_lvl2";
    if (normalized === "deranked_lvl_3") return "deranked_lvl3";
    return normalized;
}

function statusPriority(status: string): number {
    const index = GATEWAY_STATUS_PRIORITY.indexOf(
        status as (typeof GATEWAY_STATUS_PRIORITY)[number],
    );
    return index === -1 ? GATEWAY_STATUS_PRIORITY.length : index;
}

function finiteNumbers(values: unknown[], allowZero = true): number[] {
    return values
        .map((value) => Number(value))
        .filter(
            (value) =>
                Number.isFinite(value) && (allowZero ? value >= 0 : value > 0),
        );
}

function minimum(values: unknown[], allowZero = true): number | null {
    const numbers = finiteNumbers(values, allowZero);
    return numbers.length > 0 ? Math.min(...numbers) : null;
}

function maximum(values: unknown[]): number | null {
    const numbers = finiteNumbers(values, true);
    return numbers.length > 0 ? Math.max(...numbers) : null;
}

function uniqueStrings(values: unknown[]): string[] {
    return Array.from(
        new Set(
            values
                .map((value) => String(value ?? "").trim())
                .filter(Boolean),
        ),
    ).sort((a, b) => a.localeCompare(b));
}

export function summarizeMonitorRowsForModel(
    rows: MonitorModelData[],
): Partial<ModelCard> {
    const providerById = new Map<
        string,
        { id: string; name: string; status: string; is_active: boolean }
    >();

    for (const row of rows) {
        const id = String(row.provider.id ?? "").trim();
        const name = String(row.provider.name ?? id).trim();
        if (!id && !name) continue;
        const status = normalizeGatewayStatus(row.gatewayStatus);
        const key = id || name.toLowerCase();
        const existing = providerById.get(key);
        if (!existing || statusPriority(status) < statusPriority(existing.status)) {
            providerById.set(key, {
                id,
                name,
                status,
                is_active: ACTIVE_GATEWAY_STATUSES.has(status),
            });
        }
    }

    const providerDetails = Array.from(providerById.values()).sort((a, b) => {
        const priorityDifference = statusPriority(a.status) - statusPriority(b.status);
        return priorityDifference || a.name.localeCompare(b.name);
    });
    const activeProviders = providerDetails.filter((provider) => provider.is_active);
    const hasComingSoonProvider = providerDetails.some(
        (provider) => provider.status === "coming_soon",
    );
    const pricingDetailRows = rows
        .flatMap((row) => row.provider.pricingDetailRows ?? [])
        .filter(
            (row, index, allRows) =>
                allRows.findIndex(
                    (candidate) =>
                        candidate.label === row.label && candidate.value === row.value,
                ) === index,
        )
        .slice(0, 6);

    const standardInputRows = rows.filter(
        (row) => Number.isFinite(Number(row.provider.standardInputPrice)),
    );
    const standardOutputRows = rows.filter(
        (row) => Number.isFinite(Number(row.provider.standardOutputPrice)),
    );
    const lowestStandardInputRow = standardInputRows.sort(
        (a, b) => Number(a.provider.standardInputPrice) - Number(b.provider.standardInputPrice),
    )[0];
    const lowestStandardOutputRow = standardOutputRows.sort(
        (a, b) => Number(a.provider.standardOutputPrice) - Number(b.provider.standardOutputPrice),
    )[0];
    const lowestFromPriceRow = rows
        .filter((row) => Number.isFinite(Number(row.provider.fromPrice)))
        .sort((a, b) => Number(a.provider.fromPrice) - Number(b.provider.fromPrice))[0];

    return {
        gateway_status:
            activeProviders.length > 0
                ? "active"
                : hasComingSoonProvider
                  ? "coming_soon"
                  : providerDetails.length > 0
                    ? "inactive"
                    : "not_listed",
        gateway_provider_count: providerDetails.length,
        gateway_active_provider_count: activeProviders.length,
        gateway_endpoints: uniqueStrings(rows.map((row) => row.endpoint)),
        gateway_input_modalities: uniqueStrings(
            rows.flatMap((row) => row.inputModalities ?? []),
        ),
        gateway_output_modalities: uniqueStrings(
            rows.flatMap((row) => row.outputModalities ?? []),
        ),
        gateway_features: uniqueStrings(
            rows.flatMap((row) => row.provider.features ?? []),
        ),
        gateway_tiers: uniqueStrings(rows.map((row) => row.tier)),
        gateway_provider_ids: uniqueStrings(providerDetails.map((provider) => provider.id)),
        gateway_provider_names: uniqueStrings(providerDetails.map((provider) => provider.name)),
        gateway_active_provider_names: uniqueStrings(
            activeProviders.map((provider) => provider.name),
        ),
        gateway_execution_regions: uniqueStrings(
            rows.flatMap((row) => row.provider.executionRegions ?? []),
        ),
        gateway_provider_details: providerDetails,
        gateway_api_model_ids: uniqueStrings(rows.map((row) => row.apiModelId)),
        context_lengths: finiteNumbers(rows.map((row) => row.context), false),
        supported_parameters: uniqueStrings(
            rows.flatMap((row) => row.supportedParameters ?? []),
        ),
        lowest_input_price: minimum(rows.map((row) => row.provider.inputPrice)),
        lowest_output_price: minimum(rows.map((row) => row.provider.outputPrice)),
        lowest_standard_input_price: minimum(
            rows.map((row) => row.provider.standardInputPrice),
        ),
        lowest_standard_output_price: minimum(
            rows.map((row) => row.provider.standardOutputPrice),
        ),
        lowest_standard_input_price_label:
            lowestStandardInputRow?.provider.standardInputPriceLabel ?? null,
        lowest_standard_input_price_unit:
            lowestStandardInputRow?.provider.standardInputPriceUnit ?? null,
        lowest_standard_output_price_label:
            lowestStandardOutputRow?.provider.standardOutputPriceLabel ?? null,
        lowest_standard_output_price_unit:
            lowestStandardOutputRow?.provider.standardOutputPriceUnit ?? null,
        lowest_from_price: minimum(rows.map((row) => row.provider.fromPrice)),
        lowest_from_price_unit: lowestFromPriceRow?.provider.fromPriceUnit ?? null,
        pricing_detail_rows: pricingDetailRows,
        popularity_tokens_week: maximum(rows.map((row) => row.weeklyTokensModel)),
        throughput_week: maximum(rows.map((row) => row.weeklyThroughputModel)),
        latency_week: maximum(rows.map((row) => row.weeklyLatencyModel)),
    };
}

type PrimaryDateInfo = {
    primary_date: string | null;
    primary_timestamp: number | null;
    primary_group_key: string | null;
};

function derivePrimaryDate(raw: any): PrimaryDateInfo {
    const candidates = [raw.release_date, raw.announcement_date];
    const primary_date = candidates.find(
        (value) => value && typeof value === "string"
    ) ?? null;

    if (!primary_date) {
        return {
            primary_date: null,
            primary_timestamp: null,
            primary_group_key: null,
        };
    }

    const parsed = new Date(primary_date);
    if (Number.isNaN(parsed.getTime())) {
        return {
            primary_date,
            primary_timestamp: null,
            primary_group_key: null,
        };
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    return {
        primary_date,
        primary_timestamp: parsed.getTime(),
        primary_group_key: `${year}-${month}`,
    };
}

function toStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item ?? "").trim())
            .filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

export function mapRawToModelCard(
    raw: any,
    overrides: Partial<ModelCard> = {}
): ModelCard {
    const inputTypes = toStringList(raw.input_types ?? raw.input_modalities);
    const outputTypes = toStringList(raw.output_types ?? raw.output_modalities);

    const baseCard: ModelCard = {
        model_id: raw.model_id ?? raw.id ?? raw.slug ?? '',
        name: raw.name ?? '',
        organisation_id: raw.organisation_id ?? '',
        organisation_name: normalizeOrganisationDisplayName(
            raw.organisation?.name,
            raw.organisation_id,
        ),
        organisation_colour:
            raw.organisation?.colour ?? raw.organisation?.color ?? null,
        status: raw.status ?? null,
        hidden: Boolean(raw.hidden),
        release_date: raw.release_date ?? null,
        announcement_date: raw.announcement_date ?? null,
        updated_at: raw.updated_at ?? null,
        api_model_id: raw.api_model_id ?? null,
        input_types: inputTypes,
        output_types: outputTypes,
        input_modalities: inputTypes,
        output_modalities: outputTypes,
        primary_date: null,
        primary_timestamp: null,
        primary_group_key: null,
    };

    return {
        ...baseCard,
        ...derivePrimaryDate(raw),
        ...overrides,
    };
}

type GetModelsFilter = {
    search?: string;
    includeHidden?: boolean;
};

const PAGE_SIZE = 1000;

async function fetchPagedRows(
    runQuery: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
    errorContext: string,
): Promise<any[]> {
    const rows: any[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await runQuery(from, to);

        if (error) {
            // eslint-disable-next-line no-console
            console.warn(`[getAllModels] supabase error ${errorContext}`, error.message);
            throw error;
        }

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        rows.push(...data);

        if (data.length < PAGE_SIZE) {
            break;
        }
    }

    return rows;
}

async function fetchModelsFromDb(filters: GetModelsFilter): Promise<any[]> {
    const supabase = createAdminClient();
    const includeHidden = Boolean(filters.includeHidden);

    const search = filters.search?.trim() ?? "";

    const baseSelect = `
            model_id,
            name,
            status,
            organisation_id,
            hidden,
            release_date,
            announcement_date,
            updated_at,
            api_model_id,
            input_types,
            output_types,
            organisation: data_organisations (name, colour)
        `;

    // No search filter: simple ordered query
    if (!search) {
        return fetchPagedRows(
            (from, to) =>
                applyHiddenFilter(
                    supabase.from("data_models").select(baseSelect),
                    includeHidden
                )
                    .order("name", { ascending: true })
                    .range(from, to),
            "fetching models",
        );
    }

    const like = `%${search}%`;

    // 1) Models whose name matches the search
    const [
        byNameData,
        { data: orgsData, error: orgsError },
    ] = await Promise.all([
        fetchPagedRows(
            (from, to) =>
                applyHiddenFilter(
                    supabase.from("data_models").select(baseSelect),
                    includeHidden
                )
                    .ilike("name", like)
                    .range(from, to),
            "fetching models by name",
        ),
        supabase
            .from("data_organisations")
            .select("organisation_id")
            .ilike("name", like),
    ]);

    if (orgsError) {
        // eslint-disable-next-line no-console
        console.warn(
            "[getAllModels] supabase error fetching organisations by name",
            orgsError.message
        );
        throw orgsError;
    }

    const orgIds = (orgsData ?? [])
        .map((row: any) => row.organisation_id)
        .filter((id: unknown): id is string => typeof id === "string");

    let byOrgData: any[] = [];

    if (orgIds.length > 0) {
        byOrgData = await fetchPagedRows(
            (from, to) =>
                applyHiddenFilter(
                    supabase.from("data_models").select(baseSelect),
                    includeHidden
                )
                    .in("organisation_id", orgIds)
                    .range(from, to),
            "fetching models by organisation",
        );
    }

    // Merge and de-duplicate by model_id
    const combined = [...(byNameData ?? []), ...byOrgData];

    const byId = new Map<string, any>();
    for (const row of combined) {
        const id =
            (row as any).model_id ?? (row as any).id ?? (row as any).slug;
        if (!id) continue;
        if (!byId.has(id)) {
            byId.set(id, row);
        }
    }

    const uniqueRows = Array.from(byId.values());

    // Sort by name ascending to match previous behaviour
    uniqueRows.sort((a: any, b: any) => {
        const nameA = (a?.name ?? "").toString();
        const nameB = (b?.name ?? "").toString();
        return nameA.localeCompare(nameB);
    });

    return uniqueRows;
}

function isMissingRelationError(error: unknown): boolean {
    const text = String((error as { message?: unknown })?.message ?? "").toLowerCase();
    return (
        text.includes("does not exist") ||
        text.includes("could not find table") ||
        text.includes("relation") ||
        text.includes("schema cache")
    );
}

async function fetchModelPageNoticesFromDb(): Promise<Map<string, ModelPageNotice>> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("data_api_model_page_notices")
        .select("api_model_id, tone, markdown");

    if (error) {
        if (isMissingRelationError(error)) return new Map();
        // eslint-disable-next-line no-console
        console.warn("[getAllModels] supabase error fetching model notices", error.message);
        throw error;
    }

    const notices = new Map<string, ModelPageNotice>();
    for (const row of data ?? []) {
        const notice = parseModelPageNoticeRow(row);
        if (!notice) continue;
        notices.set(notice.apiModelId, notice);
    }
    return notices;
}

function resolveModelPageNotice(
    noticesByApiModelId: Map<string, ModelPageNotice>,
    raw: any,
    gatewayModels: GatewaySupportedModel[],
    monitorRows: MonitorModelData[],
): ModelPageNotice | null {
    const candidates = [
        raw.api_model_id,
        raw.model_id,
        raw.id,
        raw.slug,
        ...gatewayModels.flatMap((model) => [
            model.modelId,
            model.selectorModelId,
            model.internalModelId,
        ]),
        ...monitorRows.flatMap((row) => [row.apiModelId, row.modelId]),
    ];

    for (const candidate of candidates) {
        const id = String(candidate ?? "").trim();
        if (!id) continue;
        const notice = noticesByApiModelId.get(id);
        if (notice) return notice;
    }

    return null;
}

export async function getAllModels(
    includeHidden: boolean,
    includeInternal = false,
): Promise<ModelCard[]> {
    const [rows, gatewayModels, monitorResult, noticesByApiModelId] = await Promise.all([
        fetchModelsFromDb({ includeHidden }),
        getGatewaySupportedModels(includeHidden),
        getMonitorModels({}, includeHidden, includeInternal),
        fetchModelPageNoticesFromDb(),
    ]);

    const gatewayModelsByInternalId = new Map<string, GatewaySupportedModel[]>();
    for (const gatewayModel of gatewayModels) {
        const internalModelId = gatewayModel.internalModelId?.trim();
        if (!internalModelId) continue;
        const list = gatewayModelsByInternalId.get(internalModelId) ?? [];
        list.push(gatewayModel);
        gatewayModelsByInternalId.set(internalModelId, list);
    }
    const monitorRowsByModelId = new Map<string, MonitorModelData[]>();
    for (const monitorRow of monitorResult.models) {
        const modelId = String(monitorRow.modelId ?? "").trim();
        if (!modelId) continue;
        const list = monitorRowsByModelId.get(modelId) ?? [];
        list.push(monitorRow);
        monitorRowsByModelId.set(modelId, list);
    }

    const models: ModelCard[] = rows
        .map((raw: any) => {
            const modelId = String(raw.model_id ?? raw.id ?? raw.slug ?? "").trim();
            const gatewaySupportedModels = modelId
                ? gatewayModelsByInternalId.get(modelId) ?? []
                : [];
            const gatewayMonitorRows = modelId
                ? monitorRowsByModelId.get(modelId) ?? []
                : [];
            return mapRawToModelCard(raw, {
                ...summarizeMonitorRowsForModel(gatewayMonitorRows),
                model_page_notice: resolveModelPageNotice(
                    noticesByApiModelId,
                    raw,
                    gatewaySupportedModels,
                    gatewayMonitorRows,
                ),
                gateway_supported_models: gatewaySupportedModels,
                gateway_monitor_rows: gatewayMonitorRows,
            });
        })
        .filter((m) => !!m.model_id);

    return models;
}

export async function getModelsFiltered(
    filters: GetModelsFilter & { includeHidden: boolean }
): Promise<ModelCard[]> {
    const rows = await fetchModelsFromDb(filters);

    const models: ModelCard[] = rows
        .map((raw: any) => mapRawToModelCard(raw))
        .filter((m) => !!m.model_id);

    return models;
}

export async function getModelsFilteredCached(
	filters: GetModelsFilter & { includeHidden: boolean }
): Promise<ModelCard[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("data:models");
	cacheTag("frontend:models");

	return getModelsFiltered(filters);
}

export async function getAllModelsCached(
    includeHidden: boolean,
    includeInternal = false,
): Promise<ModelCard[]> {
    "use cache";

    cacheLife(PUBLIC_MODEL_CATALOGUE_CACHE_LIFE);
    for (const tag of MODEL_LIST_TAGS) {
        cacheTag(tag);
    }

    console.log("[fetch] HIT DB for models");
    return getAllModels(includeHidden, includeInternal);
}
