import { join } from "path";
import { promises as fs } from "fs";
import { DIR_ORGS, DIR_PROVIDERS } from "../paths";
import { listDirs, readJsonWithHash, chunk } from "../util";
import {
    client,
    isDryRun,
    logWrite,
    assertOk,
    pruneRowsByColumn,
    touchModelTimestamps,
} from "../supa";
import { ChangeTracker } from "../state";

type ProviderStatus = "Active" | "Beta" | "Alpha" | "NotReady";
type ProviderResidencyMode =
    | "unknown"
    | "provider_managed"
    | "customer_selectable"
    | "account_selected";
type ProviderOfferScope = "global" | "regional" | "specialized";
type ProviderRegionalPricingMode =
    | "unknown"
    | "same_as_global"
    | "uplift"
    | "source_region_rates"
    | "offer_specific";
type ProviderZeroDataRetentionMode =
    | "unknown"
    | "unsupported"
    | "optional"
    | "default";
type ProviderDataPolicyTier = "unknown" | "private" | "logs" | "trains";
type ProviderDataPolicyConfidence = "unknown" | "confirmed" | "maybe";
type ProviderDataPolicyContractMode =
    | "none"
    | "customer_agreement"
    | "enterprise_agreement";

const PROVIDER_ORG_ALIASES: Record<string, string> = {
    "amazon-bedrock": "amazon",
    "elevenlabs": "eleven-labs",
    "google-ai-studio": "google",
    "google-vertex": "google",
    "minimax-lightning": "minimax",
    "moonshotai-turbo": "moonshotai",
    "nousresearch": "nous",
};

const PROVIDER_COLOUR_FALLBACKS: Record<string, string> = {
    "akashml": "#00D1FF",
    "alibaba-cloud": "#FF6A00",
    "atlascloud": "#2563EB",
    "azure": "#0078D4",
    "baseten": "#6D28D9",
    "byteplus": "#1E293B",
    "cerebras": "#00C389",
    "cloudflare": "#F38020",
    "deepinfra": "#3B82F6",
    "fireworks": "#EF4444",
    "friendli": "#4F46E5",
    "gmicloud": "#0EA5E9",
    "groq": "#F55036",
    "hyperbolic": "#7C3AED",
    "infermatic": "#0F766E",
    "ionrouter": "#334155",
    "morph": "#0F172A",
    "nebius-token-factory": "#2563EB",
    "nextbit": "#84CC16",
    "novita": "#06B6D4",
    "parasail": "#0EA5E9",
    "phala": "#14B8A6",
    "siliconflow": "#6366F1",
    "sourceful": "#0EA5E9",
    "together": "#111827",
    "venice": "#06B6D4",
    "venice-e2ee": "#0284C7",
    "weights-and-biases": "#FFBE00",
};

const normalizeColour = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
};

const hslToHex = (h: number, s: number, l: number): string => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hh = h / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
    else if (hh < 2) [r, g, b] = [x, c, 0];
    else if (hh < 3) [r, g, b] = [0, c, x];
    else if (hh < 4) [r, g, b] = [0, x, c];
    else if (hh < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const m = l - c / 2;
    const toHex = (v: number) => {
        const n = Math.round((v + m) * 255);
        return n.toString(16).padStart(2, "0");
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

const generateDeterministicColour = (seed: string): string => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return hslToHex(hue, 0.72, 0.48);
};

const loadOrganisationColours = async (): Promise<Map<string, string>> => {
    const colours = new Map<string, string>();
    const dirs = await listDirs(DIR_ORGS);
    for (const dir of dirs) {
        const fp = join(dir, "organisation.json");
        try {
            const { data } = await readJsonWithHash<any>(fp);
            const orgId = typeof data?.organisation_id === "string" ? data.organisation_id.trim().toLowerCase() : "";
            const colour = normalizeColour(data?.colour ?? data?.color ?? null);
            if (!orgId || !colour) continue;
            colours.set(orgId, colour);
        } catch {
            // ignore malformed/missing organisation files and continue
        }
    }
    return colours;
};

const resolveProviderColour = (
    providerIdRaw: unknown,
    inputColour: unknown,
    organisationColours: Map<string, string>
): string => {
    const explicit = normalizeColour(inputColour);
    if (explicit) return explicit;

    const providerId = typeof providerIdRaw === "string" ? providerIdRaw.trim().toLowerCase() : "";
    if (!providerId) return "#64748B";

    const directOrgColour = organisationColours.get(providerId);
    if (directOrgColour) return directOrgColour;

    const aliasOrgColour = organisationColours.get(PROVIDER_ORG_ALIASES[providerId] ?? "");
    if (aliasOrgColour) return aliasOrgColour;

    const fallbackColour = normalizeColour(PROVIDER_COLOUR_FALLBACKS[providerId]);
    if (fallbackColour) return fallbackColour;

    return generateDeterministicColour(providerId);
};

const toTextArray = (value?: string[] | string | null): string[] | null => {
    if (Array.isArray(value)) return value.length ? value : null;
    if (typeof value === "string") {
        const parts = value.split(",").map(v => v.trim()).filter(Boolean);
        return parts.length ? parts : null;
    }
    return null;
};

const normalizeLowercaseTextArray = (value: unknown): string[] | null => {
    const items = toTextArray(value as string[] | string | null);
    if (!items?.length) return null;
    const normalized = Array.from(
        new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))
    );
    return normalized.length ? normalized : null;
};

const parseProviderResidencyMode = (value: unknown): ProviderResidencyMode => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "provider_managed" || raw === "provider-managed") return "provider_managed";
    if (
        raw === "customer_selectable" ||
        raw === "customer-selectable" ||
        raw === "customer selectable"
    ) return "customer_selectable";
    if (raw === "account_selected" || raw === "account-selected" || raw === "account selected") {
        return "account_selected";
    }
    return "unknown";
};

const parseZeroDataRetentionMode = (value: unknown): ProviderZeroDataRetentionMode => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "unsupported") return "unsupported";
    if (raw === "optional") return "optional";
    if (raw === "default") return "default";
    return "unknown";
};

const parseProviderDataPolicyTier = (value: unknown): ProviderDataPolicyTier => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "private") return "private";
    if (raw === "logs" || raw === "logged") return "logs";
    if (raw === "trains" || raw === "train") return "trains";
    return "unknown";
};

const parseProviderDataPolicyConfidence = (
    value: unknown,
): ProviderDataPolicyConfidence => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "confirmed" || raw === "certain") return "confirmed";
    if (raw === "maybe" || raw === "uncertain" || raw === "inferred") return "maybe";
    return "unknown";
};

const parseProviderDataPolicyContractMode = (
    value: unknown,
): ProviderDataPolicyContractMode => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (
        raw === "customer_agreement" ||
        raw === "customer-agreement" ||
        raw === "agreement"
    ) {
        return "customer_agreement";
    }
    if (
        raw === "enterprise_agreement" ||
        raw === "enterprise-agreement" ||
        raw === "enterprise"
    ) {
        return "enterprise_agreement";
    }
    return "none";
};

const parseProviderOfferScope = (value: unknown): ProviderOfferScope => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "regional") return "regional";
    if (raw === "specialized") return "specialized";
    return "global";
};

const parseProviderRegionalPricingMode = (
    value: unknown
): ProviderRegionalPricingMode => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "same_as_global" || raw === "same-as-global" || raw === "same as global") {
        return "same_as_global";
    }
    if (raw === "uplift") return "uplift";
    if (
        raw === "source_region_rates" ||
        raw === "source-region-rates" ||
        raw === "source region rates"
    ) {
        return "source_region_rates";
    }
    if (
        raw === "offer_specific" ||
        raw === "offer-specific" ||
        raw === "offer specific"
    ) {
        return "offer_specific";
    }
    return "unknown";
};

const toNullableInt = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed =
        typeof value === "number"
            ? value
            : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const toNullableIsoTimestamp = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    // Already ISO-like / parseable.
    const directTs = Date.parse(raw);
    if (Number.isFinite(directTs)) {
        return new Date(directTs).toISOString();
    }

    // Fallback for slash-separated values from spreadsheets, e.g. "29/1/4/25".
    // If it cannot be interpreted unambiguously, prefer null over bad writes.
    const slashParts = raw.split("/").map((part) => part.trim()).filter(Boolean);
    if (slashParts.length === 3) {
        // Try d/m/yyyy and d/m/yy first.
        const [dRaw, mRaw, yRaw] = slashParts;
        const day = Number.parseInt(dRaw, 10);
        const month = Number.parseInt(mRaw, 10);
        let year = Number.parseInt(yRaw, 10);
        if (
            Number.isFinite(day) &&
            Number.isFinite(month) &&
            Number.isFinite(year) &&
            day >= 1 &&
            day <= 31 &&
            month >= 1 &&
            month <= 12
        ) {
            if (year >= 0 && year < 100) {
                year += year >= 70 ? 1900 : 2000;
            }
            const ts = Date.UTC(year, month - 1, day, 0, 0, 0);
            if (Number.isFinite(ts)) return new Date(ts).toISOString();
        }
    }

    return null;
};

const toTimestampMs = (value: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const choosePreferredProviderModelRow = <
    T extends {
        effective_from: string | null;
        effective_to: string | null;
        is_active_gateway: boolean;
    },
>(
    current: T,
    candidate: T
): T => {
    const currentFrom = toTimestampMs(current.effective_from);
    const candidateFrom = toTimestampMs(candidate.effective_from);
    if (currentFrom !== candidateFrom) {
        return candidateFrom > currentFrom ? candidate : current;
    }

    const currentIsOpenEnded = current.effective_to == null;
    const candidateIsOpenEnded = candidate.effective_to == null;
    if (currentIsOpenEnded !== candidateIsOpenEnded) {
        return candidateIsOpenEnded ? candidate : current;
    }

    const currentTo = toTimestampMs(current.effective_to);
    const candidateTo = toTimestampMs(candidate.effective_to);
    if (currentTo !== candidateTo) {
        return candidateTo > currentTo ? candidate : current;
    }

    if (current.is_active_gateway !== candidate.is_active_gateway) {
        return candidate.is_active_gateway ? candidate : current;
    }

    return candidate;
};

const parseProviderStatus = (value: unknown): ProviderStatus | null => {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return null;

    const status = raw.toLowerCase();
    if (status === "beta") return "Beta";
    if (status === "alpha") return "Alpha";
    if (
        status === "notready" ||
        status === "not_ready" ||
        status === "not-ready" ||
        status === "not ready"
    ) return "NotReady";
    if (status === "active") return "Active";
    return null;
};

const PROVIDER_STATUS_KEYS = [
    "status",
    "Status",
    "provider_status",
    "providerStatus",
    "api_provider_status",
    "apiProviderStatus",
    "provider status",
    "Provider Status",
    "API Provider Status",
] as const;

const getProviderStatusFromSource = (source: Record<string, unknown>): {
    value: unknown;
    key: string | null;
} => {
    for (const key of PROVIDER_STATUS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            return { value: source[key], key };
        }
    }
    return { value: undefined, key: null };
};

const loadExistingProviderStatuses = async (
    supa: ReturnType<typeof client>
): Promise<Map<string, ProviderStatus>> => {
    const statuses = new Map<string, ProviderStatus>();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const res = await supa
            .from("data_api_providers")
            .select("api_provider_id,status")
            .range(offset, offset + pageSize - 1);
        const rows = assertOk(res, "select data_api_providers (api_provider_id,status)") as Array<{
            api_provider_id?: string | null;
            status?: string | null;
        }>;
        for (const row of rows) {
            if (typeof row?.api_provider_id !== "string" || !row.api_provider_id) continue;
            const parsed = parseProviderStatus(row.status);
            if (!parsed) continue;
            statuses.set(row.api_provider_id, parsed);
        }
        if (rows.length < pageSize) break;
    }
    return statuses;
};

const compactNullish = (value: unknown): unknown => {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        const next = value
            .map((item) => compactNullish(item))
            .filter((item) => item !== undefined);
        return next;
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            const compacted = compactNullish(child);
            if (compacted === undefined) continue;
            out[key] = compacted;
        }
        return out;
    }
    return value;
};

export const squashCapabilityParams = (value: unknown): Record<string, unknown> => {
    if (Array.isArray(value)) {
        const out: Record<string, unknown> = {};
        for (const entry of value) {
            if (entry && typeof entry === "object") {
                const obj = entry as Record<string, unknown>;
                const paramId = typeof obj.param_id === "string" ? obj.param_id.trim() : null;
                if (!paramId) continue;
                const { param_id: _paramId, ...metadataInput } = obj;
                const metadata = compactNullish(metadataInput);
                out[paramId] =
                    metadata && typeof metadata === "object" && !Array.isArray(metadata)
                        ? metadata as Record<string, unknown>
                        : {};
            } else if (typeof entry === "string" && entry.trim()) {
                out[entry.trim()] = {};
            }
        }
        return out;
    }
    if (value && typeof value === "object") {
        return (compactNullish(value) as Record<string, unknown>) ?? {};
    }
    return {};
};

const normalizeModelIdForMatch = (value: string): string => {
    let normalized = value.trim().toLowerCase();
    if (!normalized) return normalized;

    // Align provider-facing IDs with internal IDs that may include dated releases.
    normalized = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    // Normalize common Qwen ID style differences.
    normalized = normalized.replace(/qwen3(?=[^0-9]|$)/g, "qwen-3");
    normalized = normalized.replace(/qwen2\.5(?=[^0-9]|$)/g, "qwen-2-5");
    // Normalize dotted version tokens used in API IDs.
    normalized = normalized.replace(/(\d)\.(\d)/g, "$1-$2");
    // Unify separators.
    normalized = normalized.replace(/[._]/g, "-");
    normalized = normalized.replace(/-+/g, "-");
    return normalized;
};

const parseDateSuffix = (value: string): number | null => {
    const match = value.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const ts = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
};

const choosePreferredModelId = (modelIds: string[]): string | null => {
    if (!modelIds.length) return null;
    if (modelIds.length === 1) return modelIds[0];

    const sorted = [...modelIds].sort((a, b) => {
        const aDate = parseDateSuffix(a);
        const bDate = parseDateSuffix(b);
        if (aDate !== null || bDate !== null) {
            if (aDate === null) return 1;
            if (bDate === null) return -1;
            if (aDate !== bDate) return bDate - aDate;
        }
        return a.localeCompare(b);
    });
    return sorted[0] ?? null;
};

const chunkForInFilter = (
    values: string[],
    options: { maxChars?: number; maxItems?: number } = {}
): string[][] => {
    const maxChars = Math.max(256, options.maxChars ?? 6000);
    const maxItems = Math.max(1, options.maxItems ?? 120);
    const groups: string[][] = [];
    let current: string[] = [];
    let currentChars = 0;

    const pushCurrent = () => {
        if (!current.length) return;
        groups.push(current);
        current = [];
        currentChars = 0;
    };

    for (const raw of values) {
        const value = String(raw);
        // Approximate URL impact for ",value" in PostgREST in() filter.
        const valueChars = value.length + 1;
        const wouldExceed =
            current.length >= maxItems || (current.length > 0 && currentChars + valueChars > maxChars);

        if (wouldExceed) pushCurrent();
        current.push(value);
        currentChars += valueChars;
    }
    pushCurrent();
    return groups;
};

const loadExistingModelIds = async (
    supa: ReturnType<typeof client>
): Promise<{
    modelIds: Set<string>;
    apiToModelId: Map<string, string>;
    normalizedModelIdToModelId: Map<string, string>;
}> => {
    const modelIds = new Set<string>();
    const apiToModelId = new Map<string, string>();
    const normalizedModelIdCandidates = new Map<string, string[]>();
    const pageSize = 1000;

    const probe = await supa.from("data_models").select("api_model_id").limit(1);
    const hasApiModelIdColumn =
        !probe.error ||
        !(
            String((probe.error as any)?.code ?? "") === "42703" ||
            /column .*api_model_id/i.test(String(probe.error?.message ?? ""))
        );

    for (let offset = 0; ; offset += pageSize) {
        const res = hasApiModelIdColumn
            ? await supa
                  .from("data_models")
                  .select("model_id,api_model_id")
                  .range(offset, offset + pageSize - 1)
            : await supa
                  .from("data_models")
                  .select("model_id")
                  .range(offset, offset + pageSize - 1);
        const rows = assertOk(res, "select data_models (model_id,api_model_id)") as Array<{
            model_id?: string | null;
            api_model_id?: string | null;
        }>;
        for (const row of rows) {
            if (typeof row?.model_id === "string" && row.model_id) {
                modelIds.add(row.model_id);
                const normalized = normalizeModelIdForMatch(row.model_id);
                if (normalized) {
                    const list = normalizedModelIdCandidates.get(normalized) ?? [];
                    if (!list.includes(row.model_id)) list.push(row.model_id);
                    normalizedModelIdCandidates.set(normalized, list);
                }
                if (typeof row?.api_model_id === "string" && row.api_model_id) {
                    if (!apiToModelId.has(row.api_model_id)) {
                        apiToModelId.set(row.api_model_id, row.model_id);
                    }
                }
            }
        }
        if (rows.length < pageSize) break;
    }

    const normalizedModelIdToModelId = new Map<string, string>();
    for (const [normalized, modelIdCandidates] of normalizedModelIdCandidates.entries()) {
        const preferred = choosePreferredModelId(modelIdCandidates);
        if (preferred) normalizedModelIdToModelId.set(normalized, preferred);
    }

    return { modelIds, apiToModelId, normalizedModelIdToModelId };
};

function resolveTouchedModelIds(
    rawModelIds: Iterable<string | null | undefined>,
    lookups: {
        knownModelIds: Set<string>;
        apiToModelId: Map<string, string>;
        normalizedModelIdToModelId: Map<string, string>;
    }
): string[] {
    const resolved = new Set<string>();

    for (const value of rawModelIds) {
        const normalizedValue = typeof value === "string" ? value.trim() : "";
        if (!normalizedValue) continue;

        const modelId =
            (lookups.knownModelIds.has(normalizedValue) ? normalizedValue : "") ||
            lookups.apiToModelId.get(normalizedValue) ||
            lookups.normalizedModelIdToModelId.get(
                normalizeModelIdForMatch(normalizedValue)
            ) ||
            "";

        if (modelId) {
            resolved.add(modelId);
        }
    }

    return Array.from(resolved);
}

function resolveProviderSourceModelId(
    apiModelId: string,
    internalModelId: string,
    lookups: {
        knownModelIds: Set<string>;
        apiToModelId: Map<string, string>;
        normalizedModelIdToModelId: Map<string, string>;
    }
): string | null {
    return (
        (internalModelId && lookups.knownModelIds.has(internalModelId)
            ? internalModelId
            : "") ||
        lookups.apiToModelId.get(apiModelId) ||
        lookups.normalizedModelIdToModelId.get(
            normalizeModelIdForMatch(apiModelId)
        ) ||
        (lookups.knownModelIds.has(apiModelId) ? apiModelId : "") ||
        null
    );
}

function matchesModelFilter(
    modelFilter: string | null,
    apiModelId: string,
    internalModelId: string,
    resolvedModelId: string | null,
): boolean {
    if (!modelFilter) return true;
    const filter = modelFilter.trim();
    if (!filter) return true;
    return (
        apiModelId === filter ||
        internalModelId === filter ||
        resolvedModelId === filter
    );
}

export async function loadProviders(
    tracker: ChangeTracker,
    opts?: { modelId?: string | null }
) {
    const modelFilter = opts?.modelId ?? null;
    if (!modelFilter) tracker.touchPrefix(DIR_PROVIDERS);
    const dirs = await listDirs(DIR_PROVIDERS);
    const supa = client();
    const organisationColours = await loadOrganisationColours();
    const {
        modelIds: knownModelIds,
        apiToModelId,
        normalizedModelIdToModelId,
    } = await loadExistingModelIds(supa);
    const existingProviderStatuses = await loadExistingProviderStatuses(supa);
    const missingModelRefs: Array<{
        provider_id: string;
        source_file: string;
        provider_api_model_id: string;
        api_model_id: string;
        internal_model_id: string | null;
    }> = [];
    const invalidInternalModelRefs: Array<{
        provider_id: string;
        source_file: string;
        provider_api_model_id: string;
        internal_model_id: string;
    }> = [];
    const touchedModelIds = new Set<string>();
    const providerIds = new Set<string>();
    const providerModelIds = new Set<string>();
    const capabilityKeys = new Set<string>();
    const providerModelsToUpsert: Array<{
        provider_api_model_id: string;
        provider_id: string;
        api_model_id: string;
        model_id: string | null;
        provider_model_slug: string | null;
        prompt_training_policy_override: string | null;
        prompt_training_override_notes: string | null;
        prompt_training_override_source_url: string | null;
        internal_model_id: string | null;
        is_active_gateway: boolean;
        input_modalities: string[] | null;
        output_modalities: string[] | null;
        quantization_scheme: string | null;
        context_length: number | null;
        max_output_tokens: number | null;
        effective_from: string | null;
        effective_to: string | null;
    }> = [];
    const capabilityRowsToUpsert: Array<{
        provider_api_model_id: string;
        capability_id: string;
        status: string;
        params: Record<string, unknown>;
        max_input_tokens: number | null;
        max_output_tokens: number | null;
        notes: string | null;
    }> = [];
    let touched = false;
    let providerModelsChanged = false;
    for (const d of dirs) {
        const fp = join(d, "api_provider.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = modelFilter
            ? { status: "unchanged" as const }
            : tracker.track(fp, hash, { api_provider_id: j.api_provider_id });

        const sourceStatus = getProviderStatusFromSource(j as Record<string, unknown>);
        const parsedStatus = parseProviderStatus(sourceStatus.value);
        const fallbackStatus = existingProviderStatuses.get(j.api_provider_id) ?? "Active";
        const status = parsedStatus ?? fallbackStatus;

        if (sourceStatus.key && sourceStatus.value != null && parsedStatus == null) {
            console.warn(
                `[importer] Unrecognized provider status '${String(sourceStatus.value)}' for provider=${j.api_provider_id}; preserving existing status (${fallbackStatus}).`
            );
        }

        const row = {
            api_provider_id: j.api_provider_id,
            api_provider_name: j.api_provider_name,
            description: j.description ?? null,
            link: j.link ?? null,
            country_code: j.country_code ?? null,
            colour: resolveProviderColour(j.api_provider_id, j.colour ?? j.color ?? null, organisationColours),
            status,
            provider_family_id:
                typeof j.provider_family_id === "string" && j.provider_family_id.trim()
                    ? j.provider_family_id.trim()
                    : j.api_provider_id,
            offer_label:
                typeof j.offer_label === "string" && j.offer_label.trim()
                    ? j.offer_label.trim()
                    : null,
            offer_scope: parseProviderOfferScope(j.offer_scope),
            residency_mode: parseProviderResidencyMode(j.residency_mode),
            default_execution_regions: normalizeLowercaseTextArray(j.default_execution_regions),
            default_data_regions: normalizeLowercaseTextArray(j.default_data_regions),
            zero_data_retention: parseZeroDataRetentionMode(j.zero_data_retention),
            residency_source_url:
                typeof j.residency_source_url === "string" && j.residency_source_url.trim()
                    ? j.residency_source_url.trim()
                    : null,
            residency_notes:
                typeof j.residency_notes === "string" && j.residency_notes.trim()
                    ? j.residency_notes.trim()
                    : null,
            regional_pricing_mode: parseProviderRegionalPricingMode(
                j.regional_pricing_mode
            ),
            regional_pricing_uplift_percent:
                typeof j.regional_pricing_uplift_percent === "number" &&
                Number.isFinite(j.regional_pricing_uplift_percent)
                    ? j.regional_pricing_uplift_percent
                    : null,
            pricing_source_url:
                typeof j.pricing_source_url === "string" && j.pricing_source_url.trim()
                    ? j.pricing_source_url.trim()
                    : null,
            regional_pricing_notes:
                typeof j.regional_pricing_notes === "string" &&
                j.regional_pricing_notes.trim()
                    ? j.regional_pricing_notes.trim()
                    : null,
            prompt_training_policy:
                typeof j.prompt_training_policy === "string" &&
                j.prompt_training_policy.trim()
                    ? j.prompt_training_policy.trim()
                    : "unknown",
            prompt_training_notes:
                typeof j.prompt_training_notes === "string" &&
                j.prompt_training_notes.trim()
                    ? j.prompt_training_notes.trim()
                    : null,
            prompt_training_source_url:
                typeof j.prompt_training_source_url === "string" &&
                j.prompt_training_source_url.trim()
                    ? j.prompt_training_source_url.trim()
                    : null,
            data_policy_tier: parseProviderDataPolicyTier(j.data_policy_tier),
            data_policy_confidence: parseProviderDataPolicyConfidence(
                j.data_policy_confidence,
            ),
            data_policy_contract_mode: parseProviderDataPolicyContractMode(
                j.data_policy_contract_mode,
            ),
            data_policy_contract_notes:
                typeof j.data_policy_contract_notes === "string" &&
                j.data_policy_contract_notes.trim()
                    ? j.data_policy_contract_notes.trim()
                    : null,
            user_identifier_policy:
                typeof j.user_identifier_policy === "string" &&
                j.user_identifier_policy.trim()
                    ? j.user_identifier_policy.trim()
                    : "unknown",
            user_identifier_notes:
                typeof j.user_identifier_notes === "string" &&
                j.user_identifier_notes.trim()
                    ? j.user_identifier_notes.trim()
                    : null,
            privacy_policy_url:
                typeof j.privacy_policy_url === "string" &&
                j.privacy_policy_url.trim()
                    ? j.privacy_policy_url.trim()
                    : null,
            terms_of_service_url:
                typeof j.terms_of_service_url === "string" &&
                j.terms_of_service_url.trim()
                    ? j.terms_of_service_url.trim()
                    : null,
            ...(j.stream_cancellation_support !== undefined ? {
                stream_cancellation_support:
                    ["supported", "unsupported", "unknown"].includes(j.stream_cancellation_support)
                        ? j.stream_cancellation_support
                        : "unknown",
                stream_cancellation_stops_provider_billing:
                    typeof j.stream_cancellation_stops_provider_billing === "boolean"
                        ? j.stream_cancellation_stops_provider_billing
                        : null,
                stream_cancellation_usage_recovery:
                    ["authoritative", "unknown"].includes(j.stream_cancellation_usage_recovery)
                        ? j.stream_cancellation_usage_recovery
                        : "unknown",
                stream_cancellation_evidence_kind:
                    ["provider", "aggregator", "none"].includes(j.stream_cancellation_evidence_kind)
                        ? j.stream_cancellation_evidence_kind
                        : "none",
                stream_cancellation_source_url:
                    typeof j.stream_cancellation_source_url === "string" && j.stream_cancellation_source_url.trim()
                        ? j.stream_cancellation_source_url.trim()
                        : null,
                stream_cancellation_verified_at:
                    typeof j.stream_cancellation_verified_at === "string" && j.stream_cancellation_verified_at.trim()
                        ? j.stream_cancellation_verified_at.trim()
                        : null,
            } : {}),
        };
        providerIds.add(row.api_provider_id);
        if (change.status !== "unchanged") {
            touched = true;

            if (isDryRun()) {
                logWrite("public.data_api_providers", "UPSERT", row, { onConflict: "api_provider_id" });
            } else {
                const res = await supa
                    .from("data_api_providers")
                    .upsert(row, { onConflict: "api_provider_id" });

                assertOk(res, "upsert data_api_providers");
            }
        }

        const modelsPath = join(d, "models.json");
        try {
            await fs.access(modelsPath);
            const { data: models, hash: modelsHash } = await readJsonWithHash<any[]>(modelsPath);
            const linkedModelIds = Array.from(
                new Set(
                    (models ?? []).flatMap((model) => [
                        typeof model?.internal_model_id === "string"
                            ? model.internal_model_id.trim()
                            : "",
                        typeof model?.api_model_id === "string"
                            ? model.api_model_id.trim()
                            : "",
                    ]).filter(Boolean)
                )
            );
            const modelsChange = modelFilter
                ? { status: "unchanged" as const }
                : tracker.track(modelsPath, modelsHash, {
                    api_provider_id: j.api_provider_id,
                    kind: "provider_models",
                    linked_model_ids: linkedModelIds,
                });
            if (modelsChange.status !== "unchanged") {
                touched = true;
                providerModelsChanged = true;
            }
            const shouldTouchProviderModels =
                Boolean(modelFilter) ||
                tracker.isFullImport() ||
                change.status !== "unchanged" ||
                modelsChange.status !== "unchanged";

            for (const model of models ?? []) {
                const apiModelId =
                    typeof model?.api_model_id === "string" ? model.api_model_id.trim() : "";
                const internalModelId =
                    typeof model?.internal_model_id === "string"
                        ? model.internal_model_id.trim()
                        : "";
                if (!model?.provider_api_model_id || !apiModelId) continue;

                const resolvedModelId = resolveProviderSourceModelId(
                    apiModelId,
                    internalModelId,
                    {
                        knownModelIds,
                        apiToModelId,
                        normalizedModelIdToModelId,
                    }
                );
                if (
                    !matchesModelFilter(
                        modelFilter,
                        apiModelId,
                        internalModelId,
                        resolvedModelId,
                    )
                ) {
                    continue;
                }

                const hasResolvedModelId = Boolean(resolvedModelId);
                if (!hasResolvedModelId) {
                    missingModelRefs.push({
                        provider_id: j.api_provider_id,
                        source_file: modelsPath,
                        provider_api_model_id: model.provider_api_model_id,
                        api_model_id: model.api_model_id,
                        internal_model_id: internalModelId || null,
                    });
                }
                const hasValidInternalModelId =
                    Boolean(internalModelId) && knownModelIds.has(internalModelId);
                if (internalModelId && !hasValidInternalModelId) {
                    invalidInternalModelRefs.push({
                        provider_id: j.api_provider_id,
                        source_file: modelsPath,
                        provider_api_model_id: model.provider_api_model_id,
                        internal_model_id: internalModelId,
                    });
                }
                const effectiveInternalModelId =
                    (hasValidInternalModelId ? internalModelId : "") ||
                    (hasResolvedModelId ? resolvedModelId : null);
                if (shouldTouchProviderModels && resolvedModelId) {
                    touchedModelIds.add(resolvedModelId);
                }
                const provider_api_model_id = model.provider_api_model_id;
                providerModelIds.add(provider_api_model_id);
                const providerModelRow = {
                    provider_api_model_id,
                    provider_id: j.api_provider_id,
                    api_model_id: apiModelId,
                    model_id: hasResolvedModelId ? resolvedModelId : null,
                    provider_model_slug: model.provider_model_slug ?? null,
                    prompt_training_policy_override: model.prompt_training_policy_override ?? null,
                    prompt_training_override_notes: model.prompt_training_override_notes ?? null,
                    prompt_training_override_source_url: model.prompt_training_override_source_url ?? null,
                    internal_model_id: effectiveInternalModelId,
                    is_active_gateway: !!model.is_active_gateway,
                    input_modalities: toTextArray(model.input_modalities),
                    output_modalities: toTextArray(model.output_modalities),
                    quantization_scheme: model.quantization_scheme ?? null,
                    context_length: toNullableInt(model.context_length),
                    max_output_tokens: toNullableInt(model.max_output_tokens),
                    effective_from: toNullableIsoTimestamp(model.effective_from),
                    effective_to: toNullableIsoTimestamp(model.effective_to),
                };
                if (shouldTouchProviderModels) {
                    providerModelsToUpsert.push(providerModelRow);
                }

                for (const cap of model.capabilities ?? []) {
                    if (!cap?.capability_id) continue;
                    const capability_id = cap.capability_id;
                    capabilityKeys.add(`${provider_api_model_id}::${capability_id}`);
                    if (!shouldTouchProviderModels) continue;
                    capabilityRowsToUpsert.push({
                        provider_api_model_id,
                        capability_id,
                        status: cap.status ?? "active",
                        params: squashCapabilityParams(cap.params),
                        max_input_tokens: cap.max_input_tokens ?? null,
                        max_output_tokens: cap.max_output_tokens ?? null,
                        notes: null,
                    });
                }
            }
        } catch {
            // ignore missing models.json
        }
    }

    if (missingModelRefs.length > 0) {
        const details = missingModelRefs
            .slice(0, 25)
            .map(
                (row) =>
                    `- provider=${row.provider_id} provider_api_model_id=${row.provider_api_model_id} ` +
                    `api_model_id=${row.api_model_id} internal_model_id=${row.internal_model_id ?? "<null>"} ` +
                    `source=${row.source_file}`
            )
            .join("\n");
        const suffix =
            missingModelRefs.length > 25
                ? `\n...and ${missingModelRefs.length - 25} more unresolved rows.`
                : "";
        const message =
            `[importer] Provider model mappings with no internal model match: ${missingModelRefs.length} row(s) ` +
            `will be imported with model_id=null.\n${details}${suffix}`;
        console.warn(
            `${message}\n[importer] Continuing with unresolved rows preserved.`
        );
    }
    if (invalidInternalModelRefs.length > 0) {
        const details = invalidInternalModelRefs
            .slice(0, 25)
            .map(
                (row) =>
                    `- provider=${row.provider_id} provider_api_model_id=${row.provider_api_model_id} ` +
                    `internal_model_id=${row.internal_model_id} source=${row.source_file}`
            )
            .join("\n");
        const suffix =
            invalidInternalModelRefs.length > 25
                ? `\n...and ${invalidInternalModelRefs.length - 25} more invalid internal_model_id values.`
                : "";
        console.warn(
            `[importer] Found ${invalidInternalModelRefs.length} row(s) with invalid internal_model_id values. ` +
                `Falling back to resolved IDs (or null) to preserve import continuity.\n${details}${suffix}`
        );
    }

    const dedupedProviderModelMap = new Map<
        string,
        (typeof providerModelsToUpsert)[number]
    >();
    let collapsedProviderModelRows = 0;
    for (const row of providerModelsToUpsert) {
        const key = row.provider_api_model_id;
        const previous = dedupedProviderModelMap.get(key);
        if (!previous) {
            dedupedProviderModelMap.set(key, row);
            continue;
        }
        collapsedProviderModelRows += 1;
        if (JSON.stringify(previous) === JSON.stringify(row)) {
            continue;
        }
        dedupedProviderModelMap.set(
            key,
            choosePreferredProviderModelRow(previous, row)
        );
    }
    const dedupedProviderModels = Array.from(dedupedProviderModelMap.values());
    if (collapsedProviderModelRows > 0) {
        console.warn(
            `[importer] Collapsed ${collapsedProviderModelRows} duplicate provider model row(s) to the most current snapshot before upsert. ` +
                `data_api_provider_models currently stores one row per provider_api_model_id.`
        );
    }

    const dedupedCapabilityRowMap = new Map<
        string,
        (typeof capabilityRowsToUpsert)[number]
    >();
    let collapsedCapabilityRows = 0;
    for (const row of capabilityRowsToUpsert) {
        const key = `${row.provider_api_model_id}::${row.capability_id}`;
        const previous = dedupedCapabilityRowMap.get(key);
        if (!previous) {
            dedupedCapabilityRowMap.set(key, row);
            continue;
        }
        collapsedCapabilityRows += 1;
        if (JSON.stringify(previous) === JSON.stringify(row)) {
            continue;
        }
        dedupedCapabilityRowMap.set(key, row);
    }
    const dedupedCapabilityRows = Array.from(dedupedCapabilityRowMap.values());
    if (collapsedCapabilityRows > 0) {
        console.warn(
            `[importer] Collapsed ${collapsedCapabilityRows} duplicate provider capability row(s) to the latest snapshot before upsert.`
        );
    }

    const deletions = modelFilter ? [] : tracker.getDeleted(DIR_PROVIDERS);
    for (const deletion of deletions) {
        const linkedModelIds = Array.isArray(deletion.info.meta?.linked_model_ids)
            ? deletion.info.meta.linked_model_ids
            : [];
        for (const touchedModelId of resolveTouchedModelIds(linkedModelIds, {
            knownModelIds,
            apiToModelId,
            normalizedModelIdToModelId,
        })) {
            touchedModelIds.add(touchedModelId);
        }
    }
    touched = touched || deletions.length > 0;
    const shouldPruneProviderModels =
        !modelFilter &&
        (tracker.isFullImport() || providerModelsChanged || deletions.length > 0);

    if (touched) {
        await pruneRowsByColumn(supa, "data_api_providers", "api_provider_id", providerIds, "data_api_providers");
    }

    if (dedupedProviderModels.length) {
        for (const group of chunk(dedupedProviderModels, 500)) {
            if (isDryRun()) {
                for (const row of group) {
                    logWrite("public.data_api_provider_models", "UPSERT", row, {
                        onConflict: "provider_api_model_id",
                    });
                }
                continue;
            }
            assertOk(
                await supa
                    .from("data_api_provider_models")
                    .upsert(group, { onConflict: "provider_api_model_id" }),
                "upsert data_api_provider_models"
            );
        }
    }

    if (dedupedCapabilityRows.length) {
        for (const group of chunk(dedupedCapabilityRows, 500)) {
            if (isDryRun()) {
                for (const row of group) {
                    logWrite("public.data_api_provider_model_capabilities", "UPSERT", row, {
                        onConflict: "provider_api_model_id,capability_id",
                    });
                }
                continue;
            }
            assertOk(
                await supa
                    .from("data_api_provider_model_capabilities")
                    .upsert(group, { onConflict: "provider_api_model_id,capability_id" }),
                "upsert data_api_provider_model_capabilities"
            );
        }
    }

    if (providerModelIds.size && !isDryRun() && shouldPruneProviderModels) {
        await pruneRowsByColumn(
            supa,
            "data_api_provider_models",
            "provider_api_model_id",
            providerModelIds,
            "data_api_provider_models"
        );
    }

    if (capabilityKeys.size && !isDryRun() && shouldPruneProviderModels) {
        const keys = Array.from(capabilityKeys);
        for (const group of chunk(keys, 500)) {
            const providerIdsChunk = Array.from(
                new Set(group.map((key) => key.split("::")[0]))
            );
            const providerIdBatches = chunkForInFilter(providerIdsChunk);
            let data: any[] | null = null;
            let error: any = null;
            try {
                const merged: any[] = [];
                for (const batch of providerIdBatches) {
                    const res = await supa
                        .from("data_api_provider_model_capabilities")
                        .select("provider_api_model_id, capability_id")
                        .in("provider_api_model_id", batch);
                    if (res.error) {
                        error = res.error;
                        break;
                    }
                    if (Array.isArray(res.data) && res.data.length) {
                        merged.push(...res.data);
                    }
                }
                data = merged;
            } catch (err) {
                console.warn("Failed to fetch data_api_provider_model_capabilities for pruning:", err);
                continue;
            }
            if (error) {
                console.warn("Failed to fetch data_api_provider_model_capabilities for pruning:", error);
                continue;
            }

            const keep = new Set(group);
            const toDelete = (data ?? []).filter((row: any) => {
                const key = `${row.provider_api_model_id}::${row.capability_id}`;
                return !keep.has(key);
            });
            for (const row of toDelete) {
                await supa
                    .from("data_api_provider_model_capabilities")
                    .delete()
                    .eq("provider_api_model_id", row.provider_api_model_id)
                    .eq("capability_id", row.capability_id);
            }
        }
    }

    await touchModelTimestamps(supa, touchedModelIds);
}
