// Purpose: Catalogue loader for model listings.
// Why: Keeps /models route handler slim and reusable.
// How: Pulls model metadata, providers, capabilities, and pricing summaries.

import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";
import {
    normalizeCapabilityStatus,
    normalizeProviderStatus,
    normalizeRoutingStatus,
} from "@pipeline/before/context.shared";

type ProviderModelRow = {
    provider_api_model_id: string | null;
    provider_id: string | null;
    api_model_id: string | null;
    model_id: string | null;
    provider_model_slug?: string | null;
    is_active_gateway: boolean | null;
    routing_status?: string | null;
    input_modalities?: unknown;
    output_modalities?: unknown;
    effective_from?: string | null;
    effective_to?: string | null;
};

type CapabilityRow = {
    provider_api_model_id: string | null;
    capability_id: string | null;
    status?: string | null;
    params?: unknown;
    effective_from?: string | null;
    effective_to?: string | null;
};

type PricingRuleRow = {
    model_key: string | null;
    capability_id: string | null;
    pricing_plan?: string | null;
    meter: string | null;
    unit: string | null;
    unit_size: number | string | null;
    price_per_unit: number | string | null;
    currency: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
};

type ProviderDetails = {
    api_provider_id: string;
    api_provider_name: string | null;
    link: string | null;
    country_code: string | null;
    status: string | null;
    routing_status: string | null;
};

type OrganisationDetails = {
    organisation_id: string | null;
    name: string | null;
    country_code: string | null;
    colour: string | null;
};

type CatalogueProvider = {
    api_provider_id: string;
    api_provider_name: string | null;
    link: string | null;
    country_code: string | null;
    endpoints: Endpoint[];
    provider_model_slug: string | null;
    is_active_gateway: boolean;
    availability_status: "active" | "coming_soon" | "inactive";
    availability_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
    provider_status:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    provider_routing_status: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    model_routing_status: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    capability_status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
    input_modalities: string[];
    output_modalities: string[];
    effective_from: string | null;
    effective_to: string | null;
    params: string[];
};

type ProviderInfo = {
    api_provider_id: string;
    api_provider_name: string | null;
    is_active_gateway: boolean;
    availability_status: "active" | "coming_soon" | "inactive";
    availability_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
    provider_status:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    provider_routing_status: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    model_routing_status: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    capability_status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
    effective_from: string | null;
    effective_to: string | null;
    endpoints: Endpoint[];
    params: string[];
};

export type PricingMeterSummary = {
    provider_id: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string | null;
};

export type PricingSummary = {
    pricing_plan: "standard";
    meters: Record<string, PricingMeterSummary | null>;
};

export type CatalogueModel = {
    model_id: string;
    previous_model_id: string | null;
    name: string | null;
    description: string | null;
    release_date: string | null;
    deprecation_date: string | null;
    retirement_date: string | null;
    status: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
    organisation_colour: string | null;
    aliases: string[];
    endpoints: Endpoint[];
    input_types: string[];
    output_types: string[];
    providers: ProviderInfo[];
    supported_params: string[];
    top_provider: string | null;
    pricing: PricingSummary;
    availability: {
        status: "active" | "coming_soon" | "inactive" | "not_listed";
        provider_count: number;
        active_provider_count: number;
        inactive_provider_count: number;
    };
};

export type CatalogueFilters = {
    endpoints?: string[];
    providerIds?: string[];
    providerStatuses?: string[];
    providerRoutingStatuses?: string[];
    modelRoutingStatuses?: string[];
    capabilityStatuses?: string[];
    organisationIds?: string[];
    inputTypes?: string[];
    outputTypes?: string[];
    params?: string[];
    statuses?: string[];
    providerAvailabilityStatuses?: string[];
    providerAvailabilityReasons?: string[];
    availability?: "active" | "all";
};

const PRICING_METERS = [
    "input_tokens",
    "input_characters",
    "input_text_tokens",
    "input_image_tokens",
    "input_image",
    "input_video_tokens",
    "input_audio_tokens",
    "input_audio_seconds",
    "output_tokens",
    "output_text_tokens",
    "output_image_tokens",
    "output_image",
    "output_audio_tokens",
    "output_audio_seconds",
    "web_search",
    "cached_read_text_tokens",
    "cached_write_text_tokens",
];

const TOP_PROVIDER_METERS = [
    ["input_tokens", "input_text_tokens"],
    ["output_tokens", "output_text_tokens"],
] as const;

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item)))
            .filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const inner = trimmed.slice(1, -1);
            if (!inner) return [];
            return inner
                .split(",")
                .map((part) => part.trim().replace(/^"|"$/g, ""))
                .filter((part) => part.length > 0);
        }
        return trimmed
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [];
}

function parseEffectiveDate(value: unknown): Date | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(trimmed)
        ? `${trimmed}Z`
        : trimmed;
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function withinEffectiveWindow(
    effectiveFrom: string | null | undefined,
    effectiveTo: string | null | undefined,
    now: Date
): boolean {
    const from = parseEffectiveDate(effectiveFrom);
    const to = parseEffectiveDate(effectiveTo);
    if (from && Number.isFinite(from.getTime()) && now < from) return false;
    if (to && Number.isFinite(to.getTime()) && now >= to) return false;
    return true;
}

function isExpiredEffectiveWindow(
    effectiveTo: string | null | undefined,
    now: Date
): boolean {
    const to = parseEffectiveDate(effectiveTo);
    return Boolean(to && Number.isFinite(to.getTime()) && now >= to);
}

function isFutureEffectiveWindow(
    effectiveFrom: string | null | undefined,
    now: Date
): boolean {
    const from = parseEffectiveDate(effectiveFrom);
    return Boolean(from && Number.isFinite(from.getTime()) && now < from);
}

function toParamsList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item)))
            .filter((item) => item.length > 0);
    }
    if (value && typeof value === "object") {
        return Object.keys(value as Record<string, unknown>);
    }
    return toStringArray(value);
}

function parseDate(value: string | null): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function compareModels(a: CatalogueModel, b: CatalogueModel): number {
    const aPrimary = parseDate(a.release_date) ?? Number.NEGATIVE_INFINITY;
    const bPrimary = parseDate(b.release_date) ?? Number.NEGATIVE_INFINITY;
    if (aPrimary !== bPrimary) {
        return bPrimary - aPrimary;
    }
    const aName = (a.name ?? "").toLocaleLowerCase();
    const bName = (b.name ?? "").toLocaleLowerCase();
    if (aName !== bName) {
        return aName.localeCompare(bName);
    }
    return a.model_id.localeCompare(b.model_id);
}

function normalizeStringSet(values?: string[]): string[] | undefined {
    if (!values || !values.length) return undefined;
    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
    return normalized.length ? normalized : undefined;
}

function toNormalizedStatus(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

const COMING_SOON_CAPABILITIES = new Set([
    "batch",
    "video.generate",
    "video.edit",
    "music.generate",
]);

function normalizeCapabilityStatusForPublicCatalogue(
    capabilityId: string | null | undefined,
    rawStatus: string | null | undefined
):
    | "active"
    | "coming_soon"
    | "deranked_lvl1"
    | "deranked_lvl2"
    | "deranked_lvl3"
    | "disabled"
    | "internal_testing" {
    const normalized = normalizeCapabilityStatus(rawStatus);
    if (capabilityId && COMING_SOON_CAPABILITIES.has(capabilityId.trim().toLowerCase())) {
        return "coming_soon";
    }
    return normalized;
}

function matchesRequestedStatus(args: {
    requestedStatus: string;
    modelStatus: string | null;
    deprecationDate: string | null;
    retirementDate: string | null;
}): boolean {
    const requested = args.requestedStatus.trim().toLowerCase();
    const modelStatus = toNormalizedStatus(args.modelStatus);
    const now = Date.now();

    const retirementAt = parseDate(args.retirementDate);
    if (retirementAt !== null && retirementAt <= now) {
        return requested === "retired";
    }

    const deprecationAt = parseDate(args.deprecationDate);
    if (deprecationAt !== null && deprecationAt <= now) {
        return requested === "deprecated";
    }

    if (requested === "active") {
        if (!modelStatus) return true;
        return modelStatus === "active" || modelStatus === "available";
    }

    return modelStatus === requested;
}

function chunkArray<T>(values: T[], size: number): T[][] {
    if (!values.length) return [];
    const chunkSize = Math.max(1, Math.floor(size));
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += chunkSize) {
        chunks.push(values.slice(i, i + chunkSize));
    }
    return chunks;
}

function isMissingColumnError(error: unknown, column: string, table?: string): boolean {
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const code = String(candidate?.code ?? "");
    const message = String(candidate?.message ?? "");
    if (code !== "PGRST204" && code !== "42703") return false;
    if (!message.toLowerCase().includes(column.toLowerCase())) return false;
    if (!table) return true;
    return message.toLowerCase().includes(table.toLowerCase());
}

function withNullEffectiveWindow<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.map((row) => ({
        ...row,
        effective_from: null,
        effective_to: null,
    }));
}

function parseModelKey(value?: string | null): { providerId: string; apiModelId: string; capabilityId: string } | null {
    if (!value) return null;
    const parts = value.split(":");
    if (parts.length < 3) return null;
    const capabilityId = parts.pop() ?? "";
    const providerId = parts.shift() ?? "";
    const apiModelId = parts.join(":");
    if (!providerId || !apiModelId || !capabilityId) return null;
    return { providerId, apiModelId, capabilityId };
}

function parseNumeric(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function comparePerUnit(candidate: PricingRuleRow, current?: PricingMeterSummary | null): PricingMeterSummary | null {
    const unitSize = parseNumeric(candidate.unit_size) ?? 1;
    const price = parseNumeric(candidate.price_per_unit);
    if (price === null || unitSize <= 0) return current ?? null;
    const perUnit = price / unitSize;
    const currentPerUnit = current ? parseNumeric(current.price_per_unit) ?? 0 / (current.unit_size || 1) : null;
    if (current && currentPerUnit !== null && currentPerUnit <= perUnit) {
        return current;
    }
    return {
        provider_id: "",
        unit: candidate.unit ?? "token",
        unit_size: unitSize,
        price_per_unit: String(price),
        currency: candidate.currency ?? "USD",
    };
}

function initPricingSummary(): PricingSummary {
    const meters = PRICING_METERS.reduce<Record<string, PricingMeterSummary | null>>((acc, meter) => {
        acc[meter] = null;
        return acc;
    }, {});
    return { pricing_plan: "standard", meters };
}

function isPublicRoutingStatus(
    status: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled"
): boolean {
    return status !== "disabled";
}

function isPublicCapabilityStatus(
    status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing"
): boolean {
    return status !== "disabled" && status !== "internal_testing" && status !== "coming_soon";
}

function resolveProviderAvailabilityStatus(args: {
    isActiveGateway: boolean;
    providerStatus:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    providerRoutingStatus: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    modelRoutingStatus: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    capabilityStatus:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
    effectiveFrom: string | null;
    effectiveTo: string | null;
    now: Date;
}): "active" | "coming_soon" | "inactive" {
    if (isExpiredEffectiveWindow(args.effectiveTo, args.now)) {
        return "inactive";
    }

    if (
        args.isActiveGateway &&
        !isFutureEffectiveWindow(args.effectiveFrom, args.now) &&
        args.providerStatus === "active" &&
        isPublicRoutingStatus(args.providerRoutingStatus) &&
        isPublicRoutingStatus(args.modelRoutingStatus) &&
        isPublicCapabilityStatus(args.capabilityStatus)
    ) {
        return "active";
    }

    if (
        isFutureEffectiveWindow(args.effectiveFrom, args.now) ||
        args.providerStatus === "beta" ||
        args.providerStatus === "alpha" ||
        args.capabilityStatus === "coming_soon" ||
        args.capabilityStatus === "internal_testing"
    ) {
        return "coming_soon";
    }

    return "inactive";
}

function resolveProviderAvailabilityReason(args: {
    isActiveGateway: boolean;
    providerStatus:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    providerRoutingStatus: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    modelRoutingStatus: "active" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
    capabilityStatus:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
    effectiveFrom: string | null;
    effectiveTo: string | null;
    now: Date;
}):
    | "active"
    | "preview_only"
    | "gated"
    | "access_limited"
    | "region_limited"
    | "project_limited"
    | "paused"
    | "soft_blocked"
    | "deranked_lvl1"
    | "deranked_lvl2"
    | "deranked_lvl3"
    | "internal_testing"
    | "scheduled"
    | "coming_soon"
    | "provider_disabled"
    | "model_disabled"
    | "capability_disabled"
    | "provider_not_ready"
    | "provider_inactive"
    | "inactive"
    | "retired" {
    if (isExpiredEffectiveWindow(args.effectiveTo, args.now)) {
        return "retired";
    }
    if (isFutureEffectiveWindow(args.effectiveFrom, args.now)) {
        return "scheduled";
    }
    if (args.providerStatus === "beta" || args.providerStatus === "alpha") {
        return "preview_only";
    }
    if (args.providerStatus === "not_ready") {
        return "provider_not_ready";
    }
    if (args.providerStatus === "gated") {
        return "gated";
    }
    if (args.providerStatus === "access_limited") {
        return "access_limited";
    }
    if (args.providerStatus === "region_limited") {
        return "region_limited";
    }
    if (args.providerStatus === "project_limited") {
        return "project_limited";
    }
    if (args.providerStatus === "paused") {
        return "paused";
    }
    if (args.providerStatus === "soft_blocked") {
        return "soft_blocked";
    }
    if (args.providerStatus !== "active") {
        return "provider_inactive";
    }
    if (args.providerRoutingStatus === "disabled") {
        return "provider_disabled";
    }
    if (args.modelRoutingStatus === "disabled") {
        return "model_disabled";
    }
    if (args.capabilityStatus === "disabled") {
        return "capability_disabled";
    }
    if (
        args.providerRoutingStatus === "deranked_lvl1" ||
        args.providerRoutingStatus === "deranked_lvl2" ||
        args.providerRoutingStatus === "deranked_lvl3"
    ) {
        return args.providerRoutingStatus;
    }
    if (
        args.modelRoutingStatus === "deranked_lvl1" ||
        args.modelRoutingStatus === "deranked_lvl2" ||
        args.modelRoutingStatus === "deranked_lvl3"
    ) {
        return args.modelRoutingStatus;
    }
    if (args.capabilityStatus === "internal_testing") {
        return "internal_testing";
    }
    if (args.capabilityStatus === "coming_soon") {
        return "coming_soon";
    }
    if (!args.isActiveGateway) {
        return "inactive";
    }
    if (!isPublicCapabilityStatus(args.capabilityStatus)) {
        return "inactive";
    }
    if (!isPublicRoutingStatus(args.providerRoutingStatus) || !isPublicRoutingStatus(args.modelRoutingStatus)) {
        return "inactive";
    }
    return "active";
}

function isPubliclyRoutableProvider(provider: CatalogueProvider): boolean {
    return provider.availability_status === "active";
}

function availabilityPriority(value: "active" | "coming_soon" | "inactive"): number {
    if (value === "active") return 0;
    if (value === "coming_soon") return 1;
    return 2;
}

const AVAILABILITY_REASON_PRIORITY: Record<ProviderInfo["availability_reason"], number> = {
    deranked_lvl3: 0,
    deranked_lvl2: 1,
    deranked_lvl1: 2,
    active: 3,
    internal_testing: 4,
    scheduled: 5,
    preview_only: 6,
    coming_soon: 7,
    provider_not_ready: 8,
    gated: 9,
    access_limited: 10,
    region_limited: 11,
    project_limited: 12,
    paused: 13,
    soft_blocked: 14,
    provider_disabled: 15,
    model_disabled: 16,
    capability_disabled: 17,
    provider_inactive: 18,
    retired: 19,
    inactive: 20,
};

const ROUTING_STATUS_PRIORITY: Record<ProviderInfo["provider_routing_status"], number> = {
    deranked_lvl3: 0,
    deranked_lvl2: 1,
    deranked_lvl1: 2,
    active: 3,
    disabled: 4,
};

const CAPABILITY_STATUS_PRIORITY: Record<ProviderInfo["capability_status"], number> = {
    deranked_lvl3: 0,
    deranked_lvl2: 1,
    deranked_lvl1: 2,
    active: 3,
    internal_testing: 4,
    coming_soon: 5,
    disabled: 6,
};

function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
    return (a ?? "").localeCompare(b ?? "");
}

function compareProviderInfoCandidate(
    candidate: Pick<
        ProviderInfo,
        | "availability_status"
        | "availability_reason"
        | "provider_routing_status"
        | "model_routing_status"
        | "capability_status"
        | "effective_from"
        | "effective_to"
        | "endpoints"
        | "params"
    >,
    current: Pick<
        ProviderInfo,
        | "availability_status"
        | "availability_reason"
        | "provider_routing_status"
        | "model_routing_status"
        | "capability_status"
        | "effective_from"
        | "effective_to"
        | "endpoints"
        | "params"
    >
): number {
    const availabilityDelta =
        availabilityPriority(candidate.availability_status) - availabilityPriority(current.availability_status);
    if (availabilityDelta !== 0) return availabilityDelta;

    const reasonDelta =
        AVAILABILITY_REASON_PRIORITY[candidate.availability_reason] -
        AVAILABILITY_REASON_PRIORITY[current.availability_reason];
    if (reasonDelta !== 0) return reasonDelta;

    const providerRoutingDelta =
        ROUTING_STATUS_PRIORITY[candidate.provider_routing_status] -
        ROUTING_STATUS_PRIORITY[current.provider_routing_status];
    if (providerRoutingDelta !== 0) return providerRoutingDelta;

    const modelRoutingDelta =
        ROUTING_STATUS_PRIORITY[candidate.model_routing_status] -
        ROUTING_STATUS_PRIORITY[current.model_routing_status];
    if (modelRoutingDelta !== 0) return modelRoutingDelta;

    const capabilityDelta =
        CAPABILITY_STATUS_PRIORITY[candidate.capability_status] -
        CAPABILITY_STATUS_PRIORITY[current.capability_status];
    if (capabilityDelta !== 0) return capabilityDelta;

    const effectiveFromDelta = compareNullableString(candidate.effective_from, current.effective_from);
    if (effectiveFromDelta !== 0) return effectiveFromDelta;

    const effectiveToDelta = compareNullableString(candidate.effective_to, current.effective_to);
    if (effectiveToDelta !== 0) return effectiveToDelta;

    const endpointsDelta = candidate.endpoints.join(",").localeCompare(current.endpoints.join(","));
    if (endpointsDelta !== 0) return endpointsDelta;

    return candidate.params.join(",").localeCompare(current.params.join(","));
}

function scopePricingSummary(pricing: PricingSummary, visibleProviderIds: Set<string>): PricingSummary {
    const scopedMeters = Object.fromEntries(
        Object.entries(pricing.meters).map(([meter, summary]) => [
            meter,
            summary && visibleProviderIds.has(summary.provider_id) ? { ...summary } : null,
        ])
    ) as PricingSummary["meters"];

    return {
        pricing_plan: pricing.pricing_plan,
        meters: scopedMeters,
    };
}

function getTopProvider(providerMeters: Map<string, Map<string, number>>): string | null {
    let best: { provider: string; cost: number } | null = null;
    for (const [providerId, meters] of providerMeters) {
        let total = 0;
        let hasAny = false;
        for (const group of TOP_PROVIDER_METERS) {
            const price = group
                .map((meter) => meters.get(meter))
                .find((candidate): candidate is number => candidate !== undefined);
            if (price === undefined) continue;
            total += price;
            hasAny = true;
        }
        if (!hasAny) continue;
        if (!best || total < best.cost) {
            best = { provider: providerId, cost: total };
        }
    }
    return best?.provider ?? null;
}

export async function fetchCatalogue(filter: CatalogueFilters): Promise<CatalogueModel[]> {
    const supabase = getSupabaseAdmin();
    const availabilityMode = filter.availability ?? "active";
    const includeNonRoutable = availabilityMode === "all";
    const modelQuery = supabase
        .from("data_models")
        .select(
            "model_id, previous_model_id, name, description, release_date, deprecation_date, retirement_date, status, organisation_id, input_types, output_types, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name, country_code, colour)"
        )
        .eq("hidden", false);
    const { data: modelRows, error: modelError } = await modelQuery;
    if (modelError) {
        throw new Error(`Failed to load model metadata: ${modelError.message || "unknown error"}`);
    }

    const baseModels = new Map<
        string,
        {
            model_id: string;
            previous_model_id: string | null;
            name: string | null;
            description: string | null;
            release_date: string | null;
            deprecation_date: string | null;
            retirement_date: string | null;
            status: string | null;
            organisation: OrganisationDetails | null;
            organisation_id: string | null;
            input_types: string[];
            output_types: string[];
        }
    >();

    for (const model of modelRows ?? []) {
        if (!model?.model_id) continue;
        const organisation = Array.isArray(model.organisation) ? model.organisation[0] : model.organisation;
        baseModels.set(model.model_id, {
            model_id: model.model_id,
            previous_model_id: model.previous_model_id ?? null,
            name: model.name ?? null,
            description: model.description ?? null,
            release_date: model.release_date ?? null,
            deprecation_date: model.deprecation_date ?? null,
            retirement_date: model.retirement_date ?? null,
            status: model.status ?? null,
            organisation: organisation
                ? {
                    organisation_id: organisation.organisation_id ?? null,
                    name: organisation.name ?? null,
                    country_code: organisation.country_code ?? null,
                    colour: organisation.colour ?? null,
                }
                : null,
            organisation_id: model.organisation_id ?? null,
            input_types: toStringArray(model.input_types),
            output_types: toStringArray(model.output_types),
        });
    }

    const modelIds = Array.from(baseModels.keys());
    if (!modelIds.length) {
        return [];
    }

    const providerRows: ProviderModelRow[] = [];
    for (const modelIdChunk of chunkArray(modelIds, 200)) {
        let { data, error: providerError }: { data: ProviderModelRow[] | null; error: any } = await supabase
            .from("data_api_provider_models")
            .select(
                "provider_api_model_id, provider_id, api_model_id, model_id, provider_model_slug, is_active_gateway, routing_status, input_modalities, output_modalities, effective_from, effective_to"
            )
            .in("model_id", modelIdChunk);

        if (
            providerError &&
            (isMissingColumnError(providerError, "effective_from", "data_api_provider_models") ||
                isMissingColumnError(providerError, "effective_to", "data_api_provider_models"))
        ) {
            const fallback = await supabase
                .from("data_api_provider_models")
                .select(
                    "provider_api_model_id, provider_id, api_model_id, model_id, provider_model_slug, is_active_gateway, routing_status, input_modalities, output_modalities"
                )
                .in("model_id", modelIdChunk);
            data = withNullEffectiveWindow((fallback.data ?? []) as ProviderModelRow[]);
            providerError = fallback.error;
        }

        if (providerError) {
            throw new Error(`Failed to load provider models: ${providerError.message || "unknown error"}`);
        }

        const chunkRows = (data ?? []) as ProviderModelRow[];
        providerRows.push(...chunkRows);
    }

    const providerModelIds = providerRows
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));
    let capabilityRows: CapabilityRow[] = [];
    for (const providerModelIdChunk of chunkArray(providerModelIds, 200)) {
        let { data: capabilityRowsRaw, error: capabilityError }: { data: CapabilityRow[] | null; error: any } = await supabase
            .from("data_api_provider_model_capabilities")
            .select("provider_api_model_id, capability_id, status, params, effective_from, effective_to")
            .in("provider_api_model_id", providerModelIdChunk);

        if (
            capabilityError &&
            (isMissingColumnError(capabilityError, "effective_from", "data_api_provider_model_capabilities") ||
                isMissingColumnError(capabilityError, "effective_to", "data_api_provider_model_capabilities"))
        ) {
            const fallback = await supabase
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id, capability_id, status, params")
                .in("provider_api_model_id", providerModelIdChunk);
            capabilityRowsRaw = withNullEffectiveWindow((fallback.data ?? []) as CapabilityRow[]);
            capabilityError = fallback.error;
        }

        if (capabilityError) {
            throw new Error(`Failed to load provider capabilities: ${capabilityError.message || "unknown error"}`);
        }
        capabilityRows.push(...((capabilityRowsRaw ?? []) as CapabilityRow[]));
    }

    const aliasMap = new Map<string, string[]>();
    const apiModelIds = Array.from(
        new Set(providerRows.map((row) => row.api_model_id).filter(Boolean))
    );
    if (apiModelIds.length) {
        const aliases: Array<{ alias_slug: string | null; api_model_id: string | null }> = [];
        for (const apiModelIdChunk of chunkArray(apiModelIds as string[], 200)) {
            const { data, error: aliasError } = await supabase
                .from("data_api_model_aliases")
                .select("alias_slug, api_model_id")
                .eq("is_enabled", true)
                .in("api_model_id", apiModelIdChunk);
            if (aliasError) {
                throw new Error(`Failed to load model aliases: ${aliasError.message || "unknown error"}`);
            }
            aliases.push(...((data ?? []) as Array<{ alias_slug: string | null; api_model_id: string | null }>));
        }
        const aliasByApiModel = new Map<string, string[]>();
        for (const alias of aliases) {
            if (!alias?.api_model_id || !alias?.alias_slug) continue;
            const existing = aliasByApiModel.get(alias.api_model_id) ?? [];
            existing.push(alias.alias_slug);
            aliasByApiModel.set(alias.api_model_id, existing);
        }
        for (const row of providerRows) {
            const canonicalModelId = row.model_id ?? row.api_model_id;
            if (!canonicalModelId || !row.api_model_id) continue;
            const aliasesForApi = aliasByApiModel.get(row.api_model_id) ?? [];
            if (!aliasesForApi.length) continue;
            const existing = aliasMap.get(canonicalModelId) ?? [];
            for (const alias of aliasesForApi) {
                if (!existing.includes(alias)) existing.push(alias);
            }
            aliasMap.set(canonicalModelId, existing);
        }
        for (const [key, list] of aliasMap) {
            aliasMap.set(key, list.slice().sort((a, b) => a.localeCompare(b)));
        }
    }

    const now = new Date();
    const providersByModel = new Map<string, ProviderModelRow[]>();
    const providerIdSet = new Set<string>();
    for (const row of providerRows) {
        const canonicalModelId = row?.model_id ?? row?.api_model_id;
        if (!canonicalModelId || !row?.provider_id) continue;
        providerIdSet.add(row.provider_id);
        if (!includeNonRoutable && !withinEffectiveWindow(row.effective_from, row.effective_to, now)) continue;
        const existing = providersByModel.get(canonicalModelId) ?? [];
        existing.push(row as ProviderModelRow);
        providersByModel.set(canonicalModelId, existing);
    }

    const capabilitiesByProviderModel = new Map<string, CapabilityRow[]>();
    for (const cap of capabilityRows) {
        if (!cap?.provider_api_model_id || !cap?.capability_id) continue;
        if (!includeNonRoutable && !withinEffectiveWindow(cap.effective_from, cap.effective_to, now)) continue;
        const existing = capabilitiesByProviderModel.get(cap.provider_api_model_id) ?? [];
        existing.push(cap as CapabilityRow);
        capabilitiesByProviderModel.set(cap.provider_api_model_id, existing);
    }

    const providerMap = new Map<string, ProviderDetails>();
    if (providerIdSet.size) {
        const providerDetails: ProviderDetails[] = [];
        for (const providerIdChunk of chunkArray(Array.from(providerIdSet), 200)) {
            const { data, error: providerDetailsError } = await supabase
                .from("data_api_providers")
                .select("api_provider_id, api_provider_name, link, country_code, status, routing_status")
                .in("api_provider_id", providerIdChunk);
            if (providerDetailsError) {
                throw new Error(`Failed to load provider metadata: ${providerDetailsError.message || "unknown error"}`);
            }
            providerDetails.push(...((data ?? []) as ProviderDetails[]));
        }
        for (const provider of providerDetails) {
            if (!provider?.api_provider_id) continue;
            providerMap.set(provider.api_provider_id, {
                api_provider_id: provider.api_provider_id,
                api_provider_name: provider.api_provider_name ?? null,
                link: provider.link ?? null,
                country_code: provider.country_code ?? null,
                status: (provider as any).status ?? null,
                routing_status: (provider as any).routing_status ?? null,
            });
        }
    }

    const nowIso = new Date().toISOString();
    let { data: pricingRows, error: pricingError }: { data: PricingRuleRow[] | null; error: any } = await supabase
        .from("data_api_pricing_rules")
        .select("model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, effective_from, effective_to")
        .eq("pricing_plan", "standard")
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowIso})`,
            `and(effective_from.lte.${nowIso},effective_to.is.null)`,
            `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
        ].join(","));

    if (
        pricingError &&
        (isMissingColumnError(pricingError, "effective_from", "data_api_pricing_rules") ||
            isMissingColumnError(pricingError, "effective_to", "data_api_pricing_rules"))
    ) {
        const fallback = await supabase
            .from("data_api_pricing_rules")
            .select("model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency")
            .eq("pricing_plan", "standard");
        pricingRows = withNullEffectiveWindow((fallback.data ?? []) as PricingRuleRow[]);
        pricingError = fallback.error;
    }

    if (pricingError) {
        throw new Error(`Failed to load pricing rules: ${pricingError.message || "unknown error"}`);
    }

    const comboMap = new Map<string, { model_id: string | null; provider_id: string }>();
    for (const cap of capabilityRows) {
        if (!cap?.provider_api_model_id || !cap?.capability_id) continue;
        const providerModel = providerRows.find(
            (row) => row.provider_api_model_id === cap.provider_api_model_id
        );
        if (!providerModel?.provider_id || !providerModel.api_model_id) continue;
        const comboKey = `${providerModel.provider_id}:${providerModel.api_model_id}:${cap.capability_id}`;
        comboMap.set(comboKey, {
            model_id:
                providerModel.model_id ??
                providerModel.api_model_id ??
                null,
            provider_id: providerModel.provider_id,
        });
    }

    const pricingByModel = new Map<string, PricingSummary>();
    const providerMeterByModel = new Map<string, Map<string, Map<string, number>>>();

    for (const rule of pricingRows ?? []) {
        const parsed = parseModelKey(rule.model_key);
        if (!parsed) continue;
        const capabilityId = parsed.capabilityId || rule.capability_id;
        if (!capabilityId) continue;
        const comboKey = `${parsed.providerId}:${parsed.apiModelId}:${capabilityId}`;
        const combo = comboMap.get(comboKey);
        if (!combo?.model_id) continue;
        const meter = rule.meter ?? "";
        if (!PRICING_METERS.includes(meter)) continue;

        const perUnitPrice = parseNumeric(rule.price_per_unit);
        const unitSize = parseNumeric(rule.unit_size) ?? 1;
        if (perUnitPrice === null || unitSize <= 0) continue;

        const perUnit = perUnitPrice / unitSize;
        const modelPricing = pricingByModel.get(combo.model_id) ?? initPricingSummary();
        const current = modelPricing.meters[meter];
        const candidate = comparePerUnit(rule, current);
        if (candidate) {
            candidate.provider_id = combo.provider_id;
            modelPricing.meters[meter] = candidate;
        }
        pricingByModel.set(combo.model_id, modelPricing);

        const providerMeters = providerMeterByModel.get(combo.model_id) ?? new Map<string, Map<string, number>>();
        const meterMap = providerMeters.get(combo.provider_id) ?? new Map<string, number>();
        const existing = meterMap.get(meter);
        if (existing === undefined || perUnit < existing) {
            meterMap.set(meter, perUnit);
        }
        providerMeters.set(combo.provider_id, meterMap);
        providerMeterByModel.set(combo.model_id, providerMeters);
    }

    const endpointsFilter = normalizeStringSet(filter.endpoints)?.map((value) => value as Endpoint);
    const providerIdsFilter = normalizeStringSet(filter.providerIds)?.map((value) => value.toLowerCase());
    const providerStatusesFilter = normalizeStringSet(filter.providerStatuses)?.map((value) => value.toLowerCase());
    const providerRoutingStatusesFilter = normalizeStringSet(filter.providerRoutingStatuses)?.map((value) => value.toLowerCase());
    const modelRoutingStatusesFilter = normalizeStringSet(filter.modelRoutingStatuses)?.map((value) => value.toLowerCase());
    const capabilityStatusesFilter = normalizeStringSet(filter.capabilityStatuses)?.map((value) => value.toLowerCase());
    const organisationIds = normalizeStringSet(filter.organisationIds);
    const inputTypesFilter = normalizeStringSet(filter.inputTypes)?.map((value) => value.toLowerCase());
    const outputTypesFilter = normalizeStringSet(filter.outputTypes)?.map((value) => value.toLowerCase());
    const paramsFilter = normalizeStringSet(filter.params);
    const statusesFilter = normalizeStringSet(filter.statuses)?.map((value) => value.toLowerCase());
    const providerAvailabilityStatusesFilter = normalizeStringSet(filter.providerAvailabilityStatuses)?.map((value) => value.toLowerCase());
    const providerAvailabilityReasonsFilter = normalizeStringSet(filter.providerAvailabilityReasons)?.map((value) => value.toLowerCase());

    const models: CatalogueModel[] = [];
    for (const [modelId, info] of baseModels) {
        if (statusesFilter?.length) {
            const matchesAny = statusesFilter.some((requestedStatus) =>
                matchesRequestedStatus({
                    requestedStatus,
                    modelStatus: info.status,
                    deprecationDate: info.deprecation_date,
                    retirementDate: info.retirement_date,
                })
            );
            if (!matchesAny) continue;
        }

        if (organisationIds?.length) {
            const organisationId = info.organisation?.organisation_id ?? info.organisation_id ?? null;
            if (!organisationId || !organisationIds.includes(organisationId)) continue;
        }

        const providers = providersByModel.get(modelId) ?? [];
        const providerEntries: CatalogueProvider[] = [];
        for (const row of providers) {
            if (!row.provider_api_model_id) continue;
            const caps = capabilitiesByProviderModel.get(row.provider_api_model_id) ?? [];
            const providerDetails = row.provider_id ? providerMap.get(row.provider_id) : null;
            for (const cap of caps) {
                if (!cap.capability_id) continue;
                const providerStatus = normalizeProviderStatus(providerDetails?.status);
                const providerRoutingStatus = normalizeRoutingStatus(providerDetails?.routing_status);
                const modelRoutingStatus = normalizeRoutingStatus(row.routing_status);
                const capabilityStatus = normalizeCapabilityStatusForPublicCatalogue(cap.capability_id, cap.status);
                const effectiveFrom = cap.effective_from ?? row.effective_from ?? null;
                const effectiveTo = cap.effective_to ?? row.effective_to ?? null;
                providerEntries.push({
                    api_provider_id: row.provider_id!,
                    api_provider_name: providerDetails?.api_provider_name ?? null,
                    link: providerDetails?.link ?? null,
                    country_code: providerDetails?.country_code ?? null,
                    endpoints: [String(cap.capability_id) as Endpoint],
                    provider_model_slug: row.provider_model_slug ?? null,
                    is_active_gateway: Boolean(row.is_active_gateway),
                    availability_status: resolveProviderAvailabilityStatus({
                        isActiveGateway: Boolean(row.is_active_gateway),
                        providerStatus,
                        providerRoutingStatus,
                        modelRoutingStatus,
                        capabilityStatus,
                        effectiveFrom,
                        effectiveTo,
                        now,
                    }),
                    availability_reason: resolveProviderAvailabilityReason({
                        isActiveGateway: Boolean(row.is_active_gateway),
                        providerStatus,
                        providerRoutingStatus,
                        modelRoutingStatus,
                        capabilityStatus,
                        effectiveFrom,
                        effectiveTo,
                        now,
                    }),
                    provider_status: providerStatus,
                    provider_routing_status: providerRoutingStatus,
                    model_routing_status: modelRoutingStatus,
                    capability_status: capabilityStatus,
                    input_modalities: toStringArray(row.input_modalities),
                    output_modalities: toStringArray(row.output_modalities),
                    effective_from: effectiveFrom,
                    effective_to: effectiveTo,
                    params: toParamsList(cap.params),
                });
            }
        }

        const visibleProviderEntries = includeNonRoutable
            ? providerEntries
            : providerEntries.filter(isPubliclyRoutableProvider);

        const filteredProviderEntries = visibleProviderEntries.filter((entry) => {
            if (
                providerIdsFilter?.length &&
                !providerIdsFilter.includes(entry.api_provider_id.toLowerCase())
            ) {
                return false;
            }
            if (
                providerStatusesFilter?.length &&
                !providerStatusesFilter.includes(entry.provider_status.toLowerCase())
            ) {
                return false;
            }
            if (
                providerRoutingStatusesFilter?.length &&
                !providerRoutingStatusesFilter.includes(
                    entry.provider_routing_status.toLowerCase()
                )
            ) {
                return false;
            }
            if (
                modelRoutingStatusesFilter?.length &&
                !modelRoutingStatusesFilter.includes(
                    entry.model_routing_status.toLowerCase()
                )
            ) {
                return false;
            }
            if (
                capabilityStatusesFilter?.length &&
                !capabilityStatusesFilter.includes(entry.capability_status.toLowerCase())
            ) {
                return false;
            }
            if (
                providerAvailabilityStatusesFilter?.length &&
                !providerAvailabilityStatusesFilter.includes(
                    entry.availability_status.toLowerCase()
                )
            ) {
                return false;
            }
            if (
                providerAvailabilityReasonsFilter?.length &&
                !providerAvailabilityReasonsFilter.includes(
                    entry.availability_reason.toLowerCase()
                )
            ) {
                return false;
            }
            return true;
        });

        if (filteredProviderEntries.length === 0) {
            continue;
        }

        filteredProviderEntries.sort((a, b) => {
            const aName = (a.api_provider_name ?? a.api_provider_id).toLowerCase();
            const bName = (b.api_provider_name ?? b.api_provider_id).toLowerCase();
            if (aName !== bName) return aName.localeCompare(bName);
            if (a.endpoints[0] !== b.endpoints[0]) return a.endpoints[0].localeCompare(b.endpoints[0]);
            return (a.provider_model_slug ?? "").localeCompare(b.provider_model_slug ?? "");
        });

        const endpoints = Array.from(
            new Set(filteredProviderEntries.flatMap((entry) => entry.endpoints))
        ).sort();

        if (endpointsFilter?.length) {
            const hasIncluded = endpointsFilter.some((endpoint) => endpoints.includes(endpoint));
            if (!hasIncluded) continue;
        }

        if (inputTypesFilter?.length) {
            const modelInputs = info.input_types.map((type) => type.toLowerCase());
            const hasInput = inputTypesFilter.some((type) => modelInputs.includes(type));
            if (!hasInput) continue;
        }

        if (outputTypesFilter?.length) {
            const modelOutputs = info.output_types.map((type) => type.toLowerCase());
            const hasOutput = outputTypesFilter.some((type) => modelOutputs.includes(type));
            if (!hasOutput) continue;
        }

        if (paramsFilter?.length) {
            const modelParams = filteredProviderEntries.flatMap((entry) => entry.params);
            const hasParam = paramsFilter.some((param) => modelParams.includes(param));
            if (!hasParam) continue;
        }

        const aliases = aliasMap.get(modelId) ?? [];

        const providerMapForModel = new Map<string, ProviderInfo>();
        for (const entry of filteredProviderEntries) {
            const existing = providerMapForModel.get(entry.api_provider_id);
            if (!existing) {
                providerMapForModel.set(entry.api_provider_id, {
                    api_provider_id: entry.api_provider_id,
                    api_provider_name: entry.api_provider_name,
                    is_active_gateway: entry.is_active_gateway,
                    availability_status: entry.availability_status,
                    availability_reason: entry.availability_reason,
                    provider_status: entry.provider_status,
                    provider_routing_status: entry.provider_routing_status,
                    model_routing_status: entry.model_routing_status,
                    capability_status: entry.capability_status,
                    effective_from: entry.effective_from,
                    effective_to: entry.effective_to,
                    endpoints: [...entry.endpoints],
                    params: [...entry.params].sort((a, b) => a.localeCompare(b)),
                });
                continue;
            }

            existing.endpoints = Array.from(new Set([...existing.endpoints, ...entry.endpoints])).sort();
            existing.params = Array.from(new Set([...existing.params, ...entry.params])).sort((a, b) => a.localeCompare(b));
            if (compareProviderInfoCandidate(entry, existing) < 0) {
                existing.is_active_gateway = entry.is_active_gateway;
                existing.availability_status = entry.availability_status;
                existing.availability_reason = entry.availability_reason;
                existing.provider_status = entry.provider_status;
                existing.provider_routing_status = entry.provider_routing_status;
                existing.model_routing_status = entry.model_routing_status;
                existing.capability_status = entry.capability_status;
                existing.effective_from = entry.effective_from;
                existing.effective_to = entry.effective_to;
            }
        }
        const providerInfos: ProviderInfo[] = Array.from(providerMapForModel.values()).sort((a, b) =>
            a.api_provider_id.localeCompare(b.api_provider_id)
        );

        const supportedParams = Array.from(
            new Set(filteredProviderEntries.flatMap((entry) => entry.params))
        ).sort((a, b) => a.localeCompare(b));

        const activeProviderCount = providerInfos.filter((provider) => provider.availability_status === "active").length;
        const comingSoonProviderCount = providerInfos.filter((provider) => provider.availability_status === "coming_soon").length;
        const inactiveProviderCount = providerInfos.filter((provider) => provider.availability_status === "inactive").length;
        const availabilityStatus: CatalogueModel["availability"]["status"] =
            activeProviderCount > 0
                ? "active"
                : comingSoonProviderCount > 0
                    ? "coming_soon"
                    : inactiveProviderCount > 0
                        ? "inactive"
                        : "not_listed";

        const pricing = pricingByModel.get(modelId) ?? initPricingSummary();
        const filteredProviderIds = new Set(providerInfos.map((provider) => provider.api_provider_id));
        const scopedPricing = scopePricingSummary(pricing, filteredProviderIds);
        const filteredProviderMeters = new Map(
            Array.from(providerMeterByModel.get(modelId) ?? new Map()).filter(([providerId]) =>
                filteredProviderIds.has(providerId)
            )
        );
        const topProvider = getTopProvider(filteredProviderMeters);

        const model: CatalogueModel = {
            model_id: info.model_id,
            previous_model_id: info.previous_model_id,
            name: info.name,
            description: info.description,
            release_date: info.release_date,
            deprecation_date: info.deprecation_date,
            retirement_date: info.retirement_date,
            status: info.status ?? null,
            organisation_id: info.organisation?.organisation_id ?? info.organisation_id ?? null,
            organisation_name: info.organisation?.name ?? null,
            organisation_colour: info.organisation?.colour ?? null,
            aliases,
            endpoints,
            input_types: [...info.input_types],
            output_types: [...info.output_types],
            providers: providerInfos,
            supported_params: supportedParams,
            top_provider: topProvider,
            pricing: scopedPricing,
            availability: {
                status: availabilityStatus,
                provider_count: providerInfos.length,
                active_provider_count: activeProviderCount,
                inactive_provider_count: inactiveProviderCount,
            },
        };

        models.push(model);
    }

    return models.sort(compareModels);
}
