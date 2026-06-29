import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICING_METER_VALUES } from '../../../../../apps/web/src/lib/pricing/meters';

const DATA_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

const KNOWN_METERS = new Set<string>(PRICING_METER_VALUES);
const INPUT_AGGREGATE_METERS = new Set<string>(['input_tokens']);
const INPUT_DETAILED_METERS = new Set<string>([
    'input_text_tokens',
    'input_image_tokens',
    'input_audio_tokens',
    'input_video_tokens',
]);
const OUTPUT_AGGREGATE_METERS = new Set<string>(['output_tokens']);
const OUTPUT_DETAILED_METERS = new Set<string>([
    'output_text_tokens',
    'output_image_tokens',
    'output_audio_tokens',
    'output_video_tokens',
]);

const ALLOWED_BILL_MODES = new Set<string>(['all', 'over', 'between']);
const ALLOWED_BILLING_TIMESTAMP_BASES = new Set<string>([
    'request_start',
    'provider_accept',
    'completion',
    'unknown',
]);
const EXPLICIT_UTC_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const UTC_MINUTE_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseNumericValue(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    const cleaned = value.trim().replace(/,/g, '');
    if (!cleaned) return undefined;
    const normalized = cleaned.replace(/^\+/, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function isMajorError(msg: string): boolean {
    const majorPatterns = [
        /model_id.*missing|model.*name.*missing/i,
        /benchmark.*not found|benchmark.*missing/i,
        /pricing.*active.*no rules/i,
        /pricing.*invalid key/i,
        /pricing.*explicit UTC timestamp with Z/i,
        /pricing.*unknown meter/i,
        /pricing.*mixed aggregate and detailed.*meters/i,
        /pricing.*non-positive price/i,
        /pricing.*unit_size.*invalid/i,
        /pricing.*bill mode.*invalid/i,
        /pricing.*billing timestamp basis.*invalid/i,
        /pricing.*time window/i,
        /pricing.*effective_to.*before.*effective_from/i,
    ];
    return majorPatterns.some((p) => p.test(msg));
}

function hasExplicitUtcTimestamp(value: unknown): value is string {
    return typeof value === 'string' && EXPLICIT_UTC_TIMESTAMP_REGEX.test(value);
}

function parseUtcMinuteTime(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const match = value.match(UTC_MINUTE_TIME_REGEX);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

export function checkPricingEntrySafety(p: any): string[] {
    const errs: string[] = [];
    if (!p || typeof p !== 'object') return ['pricing: invalid structure'];

    const api_provider_id = typeof p.api_provider_id === 'string' ? p.api_provider_id : undefined;
    const model_id = typeof p.model_id === 'string' ? p.model_id : undefined;
    const endpoint = typeof p.endpoint === 'string' ? p.endpoint : undefined;

    if (api_provider_id && model_id && endpoint && typeof p.key === 'string') {
        const expectedKey = `${api_provider_id}:${model_id}:${endpoint}`;
        if (p.key !== expectedKey) {
            errs.push(`pricing: invalid key '${p.key}' expected '${expectedKey}'`);
        }
    }

    if (p.is_active_gateway === true) {
        if (!Array.isArray(p.rules) || p.rules.length === 0) {
            errs.push(
                `pricing: active on gateway but no rules for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
            );
        }
    }

    if (p.effective_from && !hasExplicitUtcTimestamp(p.effective_from)) {
        errs.push(
            `pricing: effective_from must use explicit UTC timestamp with Z for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
        );
    }

    if (p.effective_to && !hasExplicitUtcTimestamp(p.effective_to)) {
        errs.push(
            `pricing: effective_to must use explicit UTC timestamp with Z for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
        );
    }

    if (p.effective_from && p.effective_to) {
        const from = Date.parse(String(p.effective_from));
        const to = Date.parse(String(p.effective_to));
        if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
            errs.push(
                `pricing: effective_to is before effective_from for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
            );
        }
    }

    if (Array.isArray(p.rules)) {
        const metersInEntry = new Set<string>();
        for (const r of p.rules) {
            const meter = r?.meter;
            if (typeof meter !== 'string' || !KNOWN_METERS.has(meter)) {
                errs.push(`pricing: unknown meter '${meter}' for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`);
                continue;
            }

            if (r?.effective_from && !hasExplicitUtcTimestamp(r.effective_from)) {
                errs.push(
                    `pricing: rule effective_from must use explicit UTC timestamp with Z for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                );
            }

            if (r?.effective_to && !hasExplicitUtcTimestamp(r.effective_to)) {
                errs.push(
                    `pricing: rule effective_to must use explicit UTC timestamp with Z for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                );
            }

            if (r?.effective_from && r?.effective_to) {
                const from = Date.parse(String(r.effective_from));
                const to = Date.parse(String(r.effective_to));
                if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
                    errs.push(
                        `pricing: effective_to is before effective_from for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                    );
                }
            }

            metersInEntry.add(meter);
            const unit_size = parseNumericValue(r?.unit_size);
            if (unit_size === undefined || unit_size <= 0) {
                errs.push(
                    `pricing: unit_size invalid for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
                );
            }
            const price = parseNumericValue(r?.price_per_unit);
            if (price === undefined || price < 0) {
                errs.push(
                    `pricing: invalid price for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
                );
            }
            if (r?.bill && typeof r.bill.mode === 'string' && !ALLOWED_BILL_MODES.has(r.bill.mode)) {
                errs.push(
                    `pricing: bill mode invalid ('${r.bill.mode}') for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}` 
                );
            }
            if (
                r?.billing_timestamp_basis !== undefined &&
                r?.billing_timestamp_basis !== null &&
                !ALLOWED_BILLING_TIMESTAMP_BASES.has(String(r.billing_timestamp_basis))
            ) {
                errs.push(
                    `pricing: billing timestamp basis invalid ('${r.billing_timestamp_basis}') for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                );
            }
            if (r?.time_windows !== undefined) {
                if (!Array.isArray(r.time_windows)) {
                    errs.push(
                        `pricing: time_windows must be an array for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                    );
                } else {
                    for (const [index, window] of r.time_windows.entries()) {
                        const label = window?.label;
                        const timezone = window?.timezone;
                        const startMinute = parseUtcMinuteTime(window?.start_time);
                        const endMinute = parseUtcMinuteTime(window?.end_time);
                        if (typeof label !== 'string' || !label.trim()) {
                            errs.push(
                                `pricing: time window ${index} missing label for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                            );
                        }
                        if (timezone !== 'UTC') {
                            errs.push(
                                `pricing: time window ${index} timezone must be UTC for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                            );
                        }
                        if (startMinute === null || endMinute === null || startMinute === endMinute) {
                            errs.push(
                                `pricing: time window ${index} must use HH:mm UTC start/end times for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                            );
                        }
                        if (window?.price_per_unit !== undefined && window?.price_per_unit !== null) {
                            const windowPrice = parseNumericValue(window.price_per_unit);
                            if (windowPrice === undefined || windowPrice < 0) {
                                errs.push(
                                    `pricing: time window ${index} invalid price for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                                );
                            }
                        }
                        if (window?.priority !== undefined && window?.priority !== null) {
                            const priority = parseNumericValue(window.priority);
                            if (priority === undefined || !Number.isInteger(priority)) {
                                errs.push(
                                    `pricing: time window ${index} invalid priority for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}:${meter}`
                                );
                            }
                        }
                    }
                }
            }
        }

        const hasAggregateInput = [...INPUT_AGGREGATE_METERS].some((meter) => metersInEntry.has(meter));
        const hasDetailedInput = [...INPUT_DETAILED_METERS].some((meter) => metersInEntry.has(meter));
        if (hasAggregateInput && hasDetailedInput) {
            errs.push(
                `pricing: mixed aggregate and detailed input meters for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
            );
        }

        const hasAggregateOutput = [...OUTPUT_AGGREGATE_METERS].some((meter) => metersInEntry.has(meter));
        const hasDetailedOutput = [...OUTPUT_DETAILED_METERS].some((meter) => metersInEntry.has(meter));
        if (hasAggregateOutput && hasDetailedOutput) {
            errs.push(
                `pricing: mixed aggregate and detailed output meters for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`
            );
        }

        const findPrice = (m: string) => {
            const item = p.rules.find((x: any) => x?.meter === m);
            if (!item) return undefined;
            return parseNumericValue(item.price_per_unit);
        };
        const inTxt = findPrice('input_text_tokens');
        const outTxt = findPrice('output_text_tokens');
        const cachedRead = findPrice('cached_read_text_tokens');
        void inTxt;
        void outTxt;
        void cachedRead;
    }

    return errs;
}

export function checkApiProviderModelEntrySafety(
    row: Record<string, unknown>,
    options?: {
        providerId?: string;
        fallbackInputModalities?: unknown;
        fallbackOutputModalities?: unknown;
    }
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const providerId = options?.providerId ?? '?';
    const providerApiModelId = normalizeReference(row?.provider_api_model_id);
    const apiModelId = normalizeReference(row?.api_model_id);
    const rowLabel = `${providerId}${providerApiModelId ? ` (${providerApiModelId})` : apiModelId ? ` (${apiModelId})` : ''}`;

    if (!normalizeReference(row?.provider_model_slug)) {
        errors.push(`API provider model ${rowLabel} missing provider_model_slug`);
    }

    const configuredCapabilities = Array.isArray(row?.capabilities)
        ? row.capabilities.filter(
              (capability) =>
                  capability &&
                  typeof capability === 'object' &&
                  typeof capability.status === 'string' &&
                  capability.status !== 'disabled' &&
                  typeof capability.capability_id === 'string' &&
                  capability.capability_id.trim()
          )
        : [];

    for (const capability of configuredCapabilities) {
        const capabilityId = String(capability.capability_id).trim();
        const paramsErrors = validateCapabilityParams((capability as Record<string, unknown>).params, {
            rowLabel,
            capabilityId,
        });
        errors.push(...paramsErrors);
    }

    if (row?.is_active_gateway === true && configuredCapabilities.length === 0) {
        warnings.push(`API provider model ${rowLabel} is active on gateway but has no configured non-disabled capabilities`);
    }

    const hasValue = (value: unknown): boolean => {
        return toStringArray(value).length > 0;
    };

    const missingFields: string[] = [];
    if (!hasValue(row?.input_modalities) && !hasValue(options?.fallbackInputModalities)) {
        missingFields.push('input_modalities');
    }
    if (!hasValue(row?.output_modalities) && !hasValue(options?.fallbackOutputModalities)) {
        missingFields.push('output_modalities');
    }

    if (row?.is_active_gateway === true && configuredCapabilities.length > 0 && missingFields.length > 0) {
        warnings.push(
            `API provider model ${rowLabel} is active on gateway with active capabilities but missing ${missingFields.join(
                ' and '
            )}`
        );
    }

    return { errors, warnings };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isJsonScalar(value: unknown): boolean {
    return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

function isJsonLike(value: unknown): boolean {
    if (isJsonScalar(value)) return true;
    if (Array.isArray(value)) return value.every(isJsonLike);
    if (isPlainObject(value)) return Object.values(value).every(isJsonLike);
    return false;
}

function validateCapabilityParams(
    value: unknown,
    context: { rowLabel: string; capabilityId: string }
): string[] {
    const errors: string[] = [];
    const label = `API provider model ${context.rowLabel} capability ${context.capabilityId} params`;

    if (value == null) return errors;
    if (Array.isArray(value)) {
        for (const [index, entry] of value.entries()) {
            if (typeof entry === 'string') {
                if (!entry.trim()) {
                    errors.push(`${label}[${index}] has empty parameter name`);
                }
                continue;
            }
            if (!isPlainObject(entry)) {
                errors.push(`${label}[${index}] must be a parameter name string or object`);
                continue;
            }
            const paramId = normalizeReference(entry.param_id ?? entry.name ?? entry.id);
            if (!paramId) {
                errors.push(`${label}[${index}] missing param_id`);
            }
            if (!isJsonLike(entry)) {
                errors.push(`${label}[${index}] contains non-JSON metadata`);
            }
        }
        return errors;
    }

    if (!isPlainObject(value)) {
        errors.push(`${label} must be an array or object`);
        return errors;
    }

    for (const [paramName, detail] of Object.entries(value)) {
        if (!paramName.trim()) {
            errors.push(`${label} contains an empty parameter name`);
            continue;
        }
        if (detail === undefined) {
            errors.push(`${label}.${paramName} is undefined`);
            continue;
        }
        if (!isJsonLike(detail)) {
            errors.push(`${label}.${paramName} contains non-JSON metadata`);
        }
    }
    return errors;
}

const VIDEO_CAPABILITIES_REQUIRING_STRUCTURED_PARAMS = new Set(['video.generate']);
const VIDEO_PROVIDERS_WITH_EXECUTOR_METADATA = new Set([
    'alibaba-cloud',
    'byteplus',
    'google-ai-studio',
    'google-vertex',
    'minimax',
    'openai',
    'atlascloud',
    'runway',
    'x-ai',
]);

function isEnabledCapabilityStatus(value: unknown): boolean {
    const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return status.length === 0 || status === 'active' || status.startsWith('deranked_');
}

function getCapabilityParamsObject(value: unknown): Record<string, unknown> | null {
    return isPlainObject(value) ? value : null;
}

function getEnumValues(value: unknown): unknown[] {
    return isPlainObject(value) && Array.isArray(value.values) ? value.values : [];
}

function getStringArrayField(value: Record<string, unknown>, field: string): string[] {
    return Array.isArray(value[field])
        ? value[field].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
}

function validateVideoDurationParam(
    detail: Record<string, unknown>,
    label: string,
    paramName: string
): string[] {
    const errors: string[] = [];
    const type = normalizeReference(detail.type);
    if (type !== 'number' && type !== 'enum') {
        errors.push(`${label} params.${paramName}.type must be number or enum`);
    }
    if (type === 'enum') {
        const values = getEnumValues(detail);
        if (values.length === 0) {
            errors.push(`${label} params.${paramName}.values must not be empty when present`);
        }
        for (const value of values) {
            if (parseNumericValue(value) === undefined) {
                errors.push(`${label} params.${paramName}.values must contain numeric durations`);
                break;
            }
        }
    }
    const aliases = getStringArrayField(detail, 'aliases');
    if (!aliases.includes('duration_seconds') && !aliases.includes('durationSeconds')) {
        errors.push(`${label} params.${paramName}.aliases must include duration_seconds or durationSeconds`);
    }
    return errors;
}

function validateVideoSizeParam(
    detail: Record<string, unknown>,
    label: string,
    paramName: string
): string[] {
    const errors: string[] = [];
    const type = normalizeReference(detail.type);
    if (type !== 'string' && type !== 'enum') {
        errors.push(`${label} params.${paramName}.type must be string or enum`);
    }
    if (type === 'enum') {
        const values = getEnumValues(detail);
        if (values.length === 0) {
            errors.push(`${label} params.${paramName}.values must not be empty when present`);
        }
        for (const value of values) {
            if (typeof value !== 'string' || value.trim().length === 0) {
                errors.push(`${label} params.${paramName}.values must contain string resolutions`);
                break;
            }
        }
    }
    const aliases = getStringArrayField(detail, 'aliases');
    if (!aliases.includes('resolution')) {
        errors.push(`${label} params.${paramName}.aliases must include resolution`);
    }
    return errors;
}

function pricingCapabilitiesForBatchEndpoint(endpoint: unknown): string[] {
    switch (endpoint) {
        case '/v1/embeddings':
        case '/embeddings':
            return ['text.embed'];
        case '/v1/videos':
        case '/videos':
            return ['video.generate', 'video.generation'];
        case '/v1/images/generations':
        case '/images/generations':
            return ['image.generate', 'image.generations', 'images.generations', 'images.generate'];
        case '/v1/images/edits':
        case '/images/edits':
            return ['image.edit', 'images.edits'];
        case '/v1/moderations':
        case '/moderations':
            return ['text.moderate', 'moderations.create', 'moderation'];
        case '/v1/responses':
        case '/responses':
        case '/v1/chat/completions':
        case '/chat/completions':
            return ['text.generate', 'batch'];
        default:
            return ['batch'];
    }
}

function buildPricingCapabilityIndex(): Set<string> {
    const pricingDir = path.join(DATA_ROOT, 'pricing');
    const keys = new Set<string>();
    for (const filePath of listPricingFiles(pricingDir)) {
        const data = safeReadJson(filePath, [], 'Pricing');
        const providerId = normalizeReference(data?.api_provider_id);
        const modelId = normalizeReference(data?.api_model_id ?? data?.model_id);
        const capabilityId = normalizeReference(data?.capability_id ?? data?.endpoint);
        if (providerId && modelId && capabilityId) {
            keys.add(`${providerId}:${modelId}:${capabilityId}`);
        }
    }
    return keys;
}

function validateAsyncCapabilityMetadata(args: {
    providerId: string;
    apiModelId: string | null;
    rowLabel: string;
    capability: Record<string, unknown>;
    pricingKeys: Set<string>;
}): string[] {
    const errors: string[] = [];
    const capabilityId = normalizeReference(args.capability.capability_id);
    if (!capabilityId || !isEnabledCapabilityStatus(args.capability.status)) return errors;
    const label = `API provider model ${args.rowLabel} capability ${capabilityId}`;
    const params = getCapabilityParamsObject(args.capability.params);

    if (capabilityId === 'batch') {
        if (!params) {
            errors.push(`${label} must expose structured params with endpoint and completion_window metadata`);
            return errors;
        }
        const endpoint = getCapabilityParamsObject(params.endpoint);
        const completionWindow = getCapabilityParamsObject(params.completion_window);
        const endpointValues = getEnumValues(endpoint);
        const completionWindowValues = getEnumValues(completionWindow);

        if (!endpoint || endpoint.type !== 'enum' || endpointValues.length === 0) {
            errors.push(`${label} params.endpoint must be an enum with at least one supported endpoint`);
        }
        if (!completionWindow || completionWindow.type !== 'enum' || !completionWindowValues.includes('24h')) {
            errors.push(`${label} params.completion_window must be an enum that includes 24h`);
        }
        if (args.apiModelId && endpointValues.length > 0) {
            for (const endpointValue of endpointValues) {
                if (
                    !pricingCapabilitiesForBatchEndpoint(endpointValue).some((pricingCapability) =>
                        args.pricingKeys.has(`${args.providerId}:${args.apiModelId}:${pricingCapability}`)
                    )
                ) {
                    errors.push(
                        `${label} endpoint ${String(endpointValue)} has no matching pricing capability for ${args.providerId}:${args.apiModelId}`
                    );
                }
            }
        }
    }

    if (
        VIDEO_CAPABILITIES_REQUIRING_STRUCTURED_PARAMS.has(capabilityId) &&
        VIDEO_PROVIDERS_WITH_EXECUTOR_METADATA.has(args.providerId)
    ) {
        if (!params) {
            errors.push(`${label} must expose structured video params with duration and size metadata`);
            return errors;
        }
        for (const paramName of ['duration', 'size']) {
            const detail = getCapabilityParamsObject(params[paramName]);
            if (!detail) {
                errors.push(`${label} params.${paramName} must include structured metadata`);
                continue;
            }
            if (Array.isArray(detail.values) && detail.values.length === 0) {
                errors.push(`${label} params.${paramName}.values must not be empty when present`);
            }
            if (paramName === 'duration') {
                errors.push(...validateVideoDurationParam(detail, label, paramName));
            } else {
                errors.push(...validateVideoSizeParam(detail, label, paramName));
            }
        }
    }

    return errors;
}

const MODEL_DATE_FIELDS = ['announced_date', 'release_date', 'deprecation_date', 'retirement_date'];
const DETAIL_DATE_HINTS = ['date', 'cutoff'];
const GENERIC_MODEL_DESCRIPTION_FALLBACK =
    'On AI Stats you can compare providers, pricing, benchmarks, routing support, and availability for this model.';

type ModelEntry = {
    filePath: string;
    data: Record<string, unknown>;
};

function isValidPageNotice(
    notice: unknown
): notice is { tone: "info" | "warning" | "critical"; markdown: string } {
    if (!notice || typeof notice !== 'object') return false;
    const tone = (notice as { tone?: unknown }).tone;
    const markdown = (notice as { markdown?: unknown }).markdown;
    return (
        (tone === 'info' || tone === 'warning' || tone === 'critical') &&
        typeof markdown === 'string' &&
        markdown.trim().length > 0
    );
}

interface ValidationState {
    organisationIds: Map<string, string>;
    familyIds: Map<string, string>;
    benchmarkIds: Set<string>;
    apiProviderIds: Set<string>;
    modelIds: Map<string, string>;
    models: ModelEntry[];
    pricingEntryCount: number;
    planCount: number;
    aliasCount: number;
}

const VALIDATION_SECTION_KEYS = [
    'organisations',
    'families',
    'benchmarks',
    'apiProviders',
    'modelFiles',
    'apiProviderModels',
    'modelReferences',
    'pricing',
    'plans',
    'aliases',
] as const;

type ValidationSectionKey = (typeof VALIDATION_SECTION_KEYS)[number];

type ValidationResult = {
    key: ValidationSectionKey;
    label: string;
    info?: string;
    errors: string[];
    warnings?: string[];
};

function createState(): ValidationState {
    return {
        organisationIds: new Map(),
        familyIds: new Map(),
        benchmarkIds: new Set(),
        apiProviderIds: new Set(),
        modelIds: new Map(),
        models: [],
        pricingEntryCount: 0,
        planCount: 0,
        aliasCount: 0,
    };
}

function listDirs(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
}

function listPricingFiles(pricingDir: string): string[] {
    const files: string[] = [];
    for (const provider of listDirs(pricingDir)) {
        const providerRoot = path.join(pricingDir, provider);
        for (const levelOne of listDirs(providerRoot)) {
            const levelOneRoot = path.join(providerRoot, levelOne);
            for (const levelTwo of listDirs(levelOneRoot)) {
                const filePath = path.join(levelOneRoot, levelTwo, 'pricing.json');
                if (fs.existsSync(filePath)) {
                    files.push(filePath);
                }
            }
        }
    }
    return files;
}

function safeReadJson(filePath: string, errors: string[], label: string): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        const relative = path.relative(DATA_ROOT, filePath);
        errors.push(`${label}: failed to parse ${relative} (${(err as Error).message})`);
        return null;
    }
}

function normalizeReference(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized === '-') return null;
    return normalized;
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0 && item !== '-');
    }
    const normalized = normalizeReference(value);
    if (!normalized) return [];
    return normalized
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item !== '-');
}

function isValidDateString(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'string') return false;
    if (!value.trim()) return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed);
}

function looksLikeDateKey(name: string): boolean {
    const lower = name.toLowerCase();
    return DETAIL_DATE_HINTS.some((hint) => lower.includes(hint));
}

const ALLOWED_ORGANISATION_LINK_PLATFORMS = new Set([
    'website',
    'x',
    'github',
    'hugging_face',
    'linkedin',
    'discord',
    'facebook',
    'instagram',
    'youtube',
    'tiktok',
    'threads',
    'reddit',
]);

function checkOrganisations(state: ValidationState): string[] {
    const errors: string[] = [];
    const organisationsDir = path.join(DATA_ROOT, 'organisations');
    for (const org of listDirs(organisationsDir)) {
        const filePath = path.join(organisationsDir, org, 'organisation.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`Organisation ${org} is missing organisation.json`);
            continue;
        }
        const data = safeReadJson(filePath, errors, 'Organisation');
        if (!data) continue;
        const organisationId = typeof data.organisation_id === 'string' ? data.organisation_id.trim() : '';
        if (!organisationId) {
            errors.push(`Organisation ${org} missing organisation_id`);
            continue;
        }
        state.organisationIds.set(organisationId, filePath);
        if (typeof data.name !== 'string' || !data.name.trim()) {
            errors.push(`Organisation ${organisationId} missing name`);
        }
        const links = Array.isArray(data.organisation_links) ? data.organisation_links : [];
        const seenPlatforms = new Set<string>();
        for (const [index, link] of links.entries()) {
            const rawPlatform = typeof link?.platform === 'string' ? link.platform : '';
            const platform = rawPlatform.trim();
            const url = typeof link?.url === 'string' ? link.url.trim() : '';
            if (!platform) {
                errors.push(`Organisation ${organisationId} link ${index} missing platform`);
                continue;
            }
            if (rawPlatform !== platform) {
                errors.push(
                    `Organisation ${organisationId} link ${index} has non-canonical platform '${rawPlatform}'`
                );
            }
            if (!ALLOWED_ORGANISATION_LINK_PLATFORMS.has(platform)) {
                errors.push(
                    `Organisation ${organisationId} link ${index} has unsupported platform '${platform}'`
                );
            }
            if (seenPlatforms.has(platform)) {
                errors.push(
                    `Organisation ${organisationId} has duplicate organisation_links platform '${platform}'`
                );
            }
            seenPlatforms.add(platform);
            if (!url) {
                errors.push(`Organisation ${organisationId} link ${index} missing url`);
            }
        }
    }
    return errors;
}

function checkFamilies(state: ValidationState): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const familiesDir = path.join(DATA_ROOT, 'families');
    for (const fam of listDirs(familiesDir)) {
        const filePath = path.join(familiesDir, fam, 'family.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`Family ${fam} is missing family.json`);
            continue;
        }
        const data = safeReadJson(filePath, errors, 'Family');
        if (!data) continue;
        const familyId = typeof data.family_id === 'string' ? data.family_id.trim() : '';
        if (!familyId) {
            errors.push(`Family ${fam} missing family_id`);
            continue;
        }
        state.familyIds.set(familyId, filePath);
        if (data.organisation_id) {
            const orgId = normalizeReference(data.organisation_id);
            if (orgId && !state.organisationIds.has(orgId)) {
                errors.push(`Family ${familyId} references unknown organisation ${orgId}`);
            }
        }
        if (typeof data.family_name !== 'string' || !data.family_name.trim()) {
            warnings.push(`Family ${familyId} missing family_name`);
        }
    }
    return { errors, warnings };
}

function checkBenchmarks(state: ValidationState): string[] {
    const errors: string[] = [];
    const benchmarksDir = path.join(DATA_ROOT, 'benchmarks');
    for (const benchmark of listDirs(benchmarksDir)) {
        const filePath = path.join(benchmarksDir, benchmark, 'benchmark.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`Benchmark ${benchmark} is missing benchmark.json`);
            continue;
        }
        const data = safeReadJson(filePath, errors, 'Benchmark');
        if (!data) continue;
        const benchmarkId = typeof data.benchmark_id === 'string' ? data.benchmark_id.trim() : '';
        if (!benchmarkId) {
            errors.push(`Benchmark ${benchmark} missing benchmark_id`);
            continue;
        }
        state.benchmarkIds.add(benchmarkId);
        if (typeof data.benchmark_name !== 'string' || !data.benchmark_name.trim()) {
            errors.push(`Benchmark ${benchmarkId} missing benchmark_name`);
        }
    }
    return errors;
}

function checkApiProviders(state: ValidationState): string[] {
    const errors: string[] = [];
    const providersDir = path.join(DATA_ROOT, 'api_providers');
    for (const provider of listDirs(providersDir)) {
        const filePath = path.join(providersDir, provider, 'api_provider.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`API provider ${provider} is missing api_provider.json`);
            continue;
        }
        const data = safeReadJson(filePath, errors, 'API provider');
        if (!data) continue;
        const providerId = typeof data.api_provider_id === 'string' ? data.api_provider_id.trim() : '';
        if (!providerId) {
            errors.push(`API provider ${provider} missing api_provider_id`);
            continue;
        }
        if (
            data.provider_family_id !== undefined &&
            data.provider_family_id !== null &&
            (typeof data.provider_family_id !== 'string' || !data.provider_family_id.trim())
        ) {
            errors.push(`API provider ${providerId} has invalid provider_family_id`);
        }
        if (
            data.offer_label !== undefined &&
            data.offer_label !== null &&
            (typeof data.offer_label !== 'string' || !data.offer_label.trim())
        ) {
            errors.push(`API provider ${providerId} has invalid offer_label`);
        }
        if (
            data.offer_scope !== undefined &&
            data.offer_scope !== null &&
            !['global', 'regional', 'specialized'].includes(String(data.offer_scope))
        ) {
            errors.push(`API provider ${providerId} has invalid offer_scope '${String(data.offer_scope)}'`);
        }
        if (
            data.residency_mode !== undefined &&
            data.residency_mode !== null &&
            !['unknown', 'provider_managed', 'customer_selectable', 'account_selected'].includes(String(data.residency_mode))
        ) {
            errors.push(`API provider ${providerId} has invalid residency_mode '${String(data.residency_mode)}'`);
        }
        if (
            data.zero_data_retention !== undefined &&
            data.zero_data_retention !== null &&
            !['unknown', 'unsupported', 'optional', 'default'].includes(String(data.zero_data_retention))
        ) {
            errors.push(`API provider ${providerId} has invalid zero_data_retention '${String(data.zero_data_retention)}'`);
        }
        if (
            data.regional_pricing_mode !== undefined &&
            data.regional_pricing_mode !== null &&
            !['unknown', 'same_as_global', 'uplift', 'source_region_rates', 'offer_specific'].includes(String(data.regional_pricing_mode))
        ) {
            errors.push(`API provider ${providerId} has invalid regional_pricing_mode '${String(data.regional_pricing_mode)}'`);
        }
        if (
            data.regional_pricing_uplift_percent !== undefined &&
            data.regional_pricing_uplift_percent !== null &&
            (typeof data.regional_pricing_uplift_percent !== 'number' ||
                !Number.isFinite(data.regional_pricing_uplift_percent) ||
                data.regional_pricing_uplift_percent < 0)
        ) {
            errors.push(`API provider ${providerId} has invalid regional_pricing_uplift_percent`);
        }
        if (
            data.user_identifier_policy !== undefined &&
            data.user_identifier_policy !== null &&
            !['unknown', 'sent', 'not_sent', 'varies'].includes(String(data.user_identifier_policy))
        ) {
            errors.push(`API provider ${providerId} has invalid user_identifier_policy '${String(data.user_identifier_policy)}'`);
        }
        for (const key of [
            'prompt_training_notes',
            'prompt_training_source_url',
            'user_identifier_notes',
            'privacy_policy_url',
            'terms_of_service_url',
            'residency_source_url',
            'pricing_source_url',
        ]) {
            const value = (data as Record<string, unknown>)[key];
            if (
                value !== undefined &&
                value !== null &&
                (typeof value !== 'string' || !value.trim())
            ) {
                errors.push(`API provider ${providerId} has invalid ${key}`);
            }
        }
        for (const key of ['default_execution_regions', 'default_data_regions']) {
            const value = (data as Record<string, unknown>)[key];
            if (value !== undefined && value !== null && !Array.isArray(value)) {
                errors.push(`API provider ${providerId} field ${key} must be an array when present`);
            }
        }
        state.apiProviderIds.add(providerId);
    }
    return errors;
}

function loadModels(state: ValidationState): string[] {
    const errors: string[] = [];
    const modelsDir = path.join(DATA_ROOT, 'models');
    for (const org of listDirs(modelsDir)) {
        const orgPath = path.join(modelsDir, org);
        for (const modelName of listDirs(orgPath)) {
            const filePath = path.join(orgPath, modelName, 'model.json');
            if (!fs.existsSync(filePath)) {
                errors.push(`Model ${org}/${modelName} is missing model.json`);
                continue;
            }
            const data = safeReadJson(filePath, errors, 'Model');
            if (!data) continue;
            const modelId = typeof data.model_id === 'string' ? data.model_id.trim() : '';
            if (!modelId) {
                errors.push(`Model at ${path.relative(DATA_ROOT, filePath)} missing model_id`);
                continue;
            }
            if (state.modelIds.has(modelId)) {
                errors.push(`Duplicate model_id detected: ${modelId}`);
            } else {
                state.modelIds.set(modelId, filePath);
            }
            if (typeof data.organisation_id !== 'string' || !data.organisation_id.trim()) {
                errors.push(`Model ${modelId} missing organisation_id`);
            } else if (!state.organisationIds.has(data.organisation_id)) {
                errors.push(`Model ${modelId} references unknown organisation ${data.organisation_id}`);
            }
            state.models.push({ filePath, data });
        }
    }
    return errors;
}

function checkApiProviderModels(
    state: ValidationState
): { errors: string[]; warnings: string[]; entryCount: number } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let entryCount = 0;
    const providersDir = path.join(DATA_ROOT, 'api_providers');
    const pricingKeys = buildPricingCapabilityIndex();
    const providerModalityKnowledge = new Map<
        string,
        { input: Set<string>; output: Set<string> }
    >();
    const modelEntriesById = new Map(
        state.models
            .map((entry) => {
                const modelId = normalizeReference(entry.data.model_id);
                return modelId ? ([modelId, entry] as const) : null;
            })
            .filter((entry): entry is readonly [string, ModelEntry] => entry !== null)
    );

    for (const provider of listDirs(providersDir)) {
        const filePath = path.join(providersDir, provider, 'models.json');
        if (!fs.existsSync(filePath)) continue;
        const raw = safeReadJson(filePath, errors, 'API provider models');
        if (!raw || !Array.isArray(raw)) continue;
        for (const row of raw) {
            const data = row as Record<string, unknown>;
            const keys = [
                normalizeReference(data.internal_model_id),
                normalizeReference(data.api_model_id),
            ].filter((key): key is string => Boolean(key));
            if (keys.length === 0) continue;
            const input = toStringArray(data.input_modalities);
            const output = toStringArray(data.output_modalities);
            if (input.length === 0 && output.length === 0) continue;
            for (const key of keys) {
                const existing =
                    providerModalityKnowledge.get(key) ?? { input: new Set<string>(), output: new Set<string>() };
                input.forEach((value) => existing.input.add(value));
                output.forEach((value) => existing.output.add(value));
                providerModalityKnowledge.set(key, existing);
            }
        }
    }

    for (const provider of listDirs(providersDir)) {
        const filePath = path.join(providersDir, provider, 'models.json');
        if (!fs.existsSync(filePath)) continue;
        const raw = safeReadJson(filePath, errors, 'API provider models');
        if (!raw) continue;
        if (!Array.isArray(raw)) {
            errors.push(`API provider models ${provider} has non-array models.json`);
            continue;
        }

        for (const row of raw) {
            entryCount += 1;
            const apiModelId = normalizeReference((row as Record<string, unknown>)?.api_model_id);
            const internalModelId = normalizeReference((row as Record<string, unknown>)?.internal_model_id);
            const providerApiModelId = normalizeReference((row as Record<string, unknown>)?.provider_api_model_id);
            const rowLabel = `${provider}${providerApiModelId ? ` (${providerApiModelId})` : ''}`;
            const fallbackModelEntry =
                (internalModelId ? modelEntriesById.get(internalModelId) : undefined) ??
                (apiModelId ? modelEntriesById.get(apiModelId) : undefined);
            const fallbackModalities =
                (internalModelId ? providerModalityKnowledge.get(internalModelId) : undefined) ??
                (apiModelId ? providerModalityKnowledge.get(apiModelId) : undefined);

            const entryChecks = checkApiProviderModelEntrySafety(row as Record<string, unknown>, {
                providerId: provider,
                fallbackInputModalities:
                    fallbackModelEntry?.data.input_types ??
                    (fallbackModalities ? [...fallbackModalities.input] : undefined),
                fallbackOutputModalities:
                    fallbackModelEntry?.data.output_types ??
                    (fallbackModalities ? [...fallbackModalities.output] : undefined),
            });
            errors.push(...entryChecks.errors);
            warnings.push(...entryChecks.warnings);
            for (const capability of Array.isArray((row as Record<string, unknown>)?.capabilities)
                ? ((row as Record<string, unknown>).capabilities as unknown[])
                : []) {
                if (!isPlainObject(capability)) continue;
                errors.push(
                    ...validateAsyncCapabilityMetadata({
                        providerId: provider,
                        apiModelId,
                        rowLabel,
                        capability,
                        pricingKeys,
                    })
                );
            }

            if (!apiModelId) {
                errors.push(`API provider model ${rowLabel} missing api_model_id`);
                continue;
            }

            const hasInternalModel = internalModelId ? state.modelIds.has(internalModelId) : false;
            const hasDirectApiModel = state.modelIds.has(apiModelId);

            if (!hasInternalModel && !hasDirectApiModel) {
                errors.push(
                    `API provider model ${rowLabel} unresolved: expected base model for ` +
                        `api_model_id='${apiModelId}'${internalModelId ? ` or internal_model_id='${internalModelId}'` : ''}`
                );
                continue;
            }

            if (internalModelId && !hasInternalModel && hasDirectApiModel) {
                warnings.push(
                    `API provider model ${rowLabel} references unknown internal_model_id '${internalModelId}' ` +
                        `but resolves via api_model_id '${apiModelId}'`
                );
            }
        }
    }

    return { errors, warnings, entryCount };
}

function checkModelReferences(state: ValidationState): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const entry of state.models) {
        const { data } = entry;
        const modelId = typeof data.model_id === 'string' ? data.model_id.trim() : '';
        if (!modelId) continue;
        const label = `Model ${modelId}`;
        const prevRef = normalizeReference(data.previous_model_id);
        if (prevRef && !state.modelIds.has(prevRef)) {
            warnings.push(
                `${label} references unknown previous_model_id ${prevRef} (non-blocking: likely internal model reference)`
            );
        }
        const familyRef = normalizeReference(data.family_id);
        if (familyRef && !state.familyIds.has(familyRef)) {
            errors.push(`${label} references unknown family ${familyRef}`);
        }
        const benchmarks = Array.isArray(data.benchmarks) ? data.benchmarks : [];
        for (const bench of benchmarks) {
            const benchmarkId = typeof bench?.benchmark_id === 'string' ? bench.benchmark_id : '';
            if (!benchmarkId) {
                errors.push(`${label} contains benchmark without benchmark_id`);
                continue;
            }
            if (!state.benchmarkIds.has(benchmarkId)) {
                errors.push(`${label} references unknown benchmark ${benchmarkId}`);
            }
            const score = bench?.score;
            if (score !== undefined && score !== null && typeof score !== 'number' && typeof score !== 'string') {
                errors.push(`${label} benchmark ${benchmarkId} has invalid score type`);
            }
            const isSelfReported = bench?.is_self_reported;
            if (isSelfReported !== undefined && typeof isSelfReported !== 'boolean' && typeof isSelfReported !== 'number') {
                errors.push(`${label} benchmark ${benchmarkId} has invalid is_self_reported type`);
            }
        }
        for (const field of MODEL_DATE_FIELDS) {
            const value = data[field as keyof typeof data];
            if (!isValidDateString(value)) {
                errors.push(`${label} ${field} is not a valid ISO date`);
            }
        }
        const links = Array.isArray(data.links) ? data.links : [];
        for (const link of links) {
            if (typeof link?.platform !== 'string' || !link.platform.trim()) {
                errors.push(`${label} has a link without a platform`);
            }
            if (typeof link?.url !== 'string' || !link.url.trim()) {
                errors.push(`${label} has a link without a url`);
            }
        }
        const details = Array.isArray(data.details) ? data.details : [];
        for (const detail of details) {
            const name = typeof detail?.name === 'string' ? detail.name : '';
            if (!name) {
                errors.push(`${label} has a detail entry without a name`);
                continue;
            }
            if (looksLikeDateKey(name)) {
                const value = detail.value;
                if (value !== null && value !== undefined) {
                    if (typeof value === 'string') {
                        if (!isValidDateString(value)) {
                            errors.push(`${label} detail ${name} value is not a valid date`);
                        }
                    } else {
                        errors.push(`${label} detail ${name} has unsupported value type for a date field`);
                    }
                }
            }
        }
        const pageNotice = data.page_notice;
        if (pageNotice !== undefined && pageNotice !== null && !isValidPageNotice(pageNotice)) {
            errors.push(`${label} page_notice must include a valid tone and non-empty markdown`);
        }
        if (typeof data.name !== 'string' || !data.name.trim()) {
            errors.push(`${label} missing a name`);
        }
        const description = typeof data.description === 'string' ? data.description.trim() : '';
        if (!description) {
            errors.push(`${label} missing description`);
        } else if (description === GENERIC_MODEL_DESCRIPTION_FALLBACK) {
            errors.push(`${label} uses legacy generic description placeholder`);
        }
    }
    return { errors, warnings };
}

function checkPricing(state: ValidationState): string[] {
    const errors: string[] = [];
    const pricingDir = path.join(DATA_ROOT, 'pricing');
    for (const filePath of listPricingFiles(pricingDir)) {
        state.pricingEntryCount += 1;
        const data = safeReadJson(filePath, errors, 'Pricing');
        if (!data) continue;
        const entryErrors = checkPricingEntrySafety(data);
        const apiProviderId = typeof data['api_provider_id'] === 'string'
            ? data['api_provider_id']
            : undefined;
        if (apiProviderId && !state.apiProviderIds.has(apiProviderId)) {
            entryErrors.push(`Unknown api_provider_id ${apiProviderId}`);
        }
        const modelId = typeof data['model_id'] === 'string' ? data['model_id'] : undefined;
        if (modelId && !state.modelIds.has(modelId)) {
            entryErrors.push(`Unknown model_id ${modelId}`);
        }
        if (entryErrors.length) {
            errors.push(`${path.relative(DATA_ROOT, filePath)} -> ${entryErrors.join('; ')}`);
        }
    }
    return errors;
}

function checkSubscriptionPlans(state: ValidationState): string[] {
    const errors: string[] = [];
    const plansDir = path.join(DATA_ROOT, 'subscription_plans');
    for (const plan of listDirs(plansDir)) {
        const filePath = path.join(plansDir, plan, 'plan.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`Subscription plan ${plan} is missing plan.json`);
            continue;
        }
        state.planCount += 1;
        const data = safeReadJson(filePath, errors, 'Subscription plan');
        if (!data) continue;
        const planId = typeof data.plan_id === 'string' ? data.plan_id.trim() : plan;
        if (!planId) {
            errors.push(`Subscription plan at ${plan} missing plan_id`);
        }
        if (typeof data.name !== 'string' || !data.name.trim()) {
            errors.push(`Subscription plan ${planId} missing name`);
        }
        const providerRef = normalizeReference(data.organisation_id ?? data.provider_id ?? data.plan_provider_id);
        if (providerRef) {
            if (!state.organisationIds.has(providerRef)) {
                errors.push(`Subscription plan ${planId} references unknown organisation ${providerRef}`);
            }
        } else {
            errors.push(`Subscription plan ${planId} missing organisation_id`);
        }
        const planModels = Array.isArray(data.models) ? data.models : [];
        for (const entry of planModels) {
            const modelId = typeof entry?.model_id === 'string' ? entry.model_id : '';
            if (!modelId) {
                errors.push(`Subscription plan ${planId} has a model entry without model_id`);
                continue;
            }
            if (!state.modelIds.has(modelId)) {
                errors.push(`Subscription plan ${planId} references unknown model ${modelId}`);
            }
        }
    }
    return errors;
}

function checkAliases(state: ValidationState): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const aliasesDir = path.join(DATA_ROOT, 'aliases');
    const aliasDirs = listDirs(aliasesDir);
    state.aliasCount = aliasDirs.length;
    for (const alias of aliasDirs) {
        const filePath = path.join(aliasesDir, alias, 'alias.json');
        if (!fs.existsSync(filePath)) {
            errors.push(`Alias ${alias} is missing alias.json`);
            continue;
        }
        const data = safeReadJson(filePath, errors, 'Alias');
        if (!data) continue;
        const aliasSlug = typeof data.alias_slug === 'string' ? data.alias_slug : alias;
        const resolved = normalizeReference(data.resolved_model_id);
        if (!resolved) {
            warnings.push(`Alias ${aliasSlug} missing resolved_model_id`);
            continue;
        }
        if (!state.modelIds.has(resolved)) {
            errors.push(`Alias ${aliasSlug} resolves to unknown model ${resolved}`);
        }
    }
    return { errors, warnings };
}

export function runWebDataValidation(options?: { gatingSections?: ValidationSectionKey[] }) {
    const state = createState();
    const results: ValidationResult[] = [];

    const orgErrors = checkOrganisations(state);
    results.push({
        key: 'organisations',
        label: 'Organisations',
        info: `${state.organisationIds.size} entries`,
        errors: orgErrors,
    });

    const familyChecks = checkFamilies(state);
    results.push({
        key: 'families',
        label: 'Families',
        info: `${state.familyIds.size} entries`,
        errors: familyChecks.errors,
        warnings: familyChecks.warnings,
    });

    const benchmarkErrors = checkBenchmarks(state);
    results.push({
        key: 'benchmarks',
        label: 'Benchmarks',
        info: `${state.benchmarkIds.size} entries`,
        errors: benchmarkErrors,
    });

    const apiErrors = checkApiProviders(state);
    results.push({
        key: 'apiProviders',
        label: 'API providers',
        info: `${state.apiProviderIds.size} entries`,
        errors: apiErrors,
    });

    const modelLoadErrors = loadModels(state);
    results.push({ key: 'modelFiles', label: 'Model files', info: `${state.models.length} files`, errors: modelLoadErrors });

    const apiProviderModelChecks = checkApiProviderModels(state);
    results.push({
        key: 'apiProviderModels',
        label: 'API provider models',
        info: `${apiProviderModelChecks.entryCount} entries`,
        errors: apiProviderModelChecks.errors,
        warnings: apiProviderModelChecks.warnings,
    });

    const modelRefChecks = checkModelReferences(state);
    results.push({
        key: 'modelReferences',
        label: 'Model references',
        info: `${state.models.length} models`,
        errors: modelRefChecks.errors,
        warnings: modelRefChecks.warnings,
    });

    const pricingErrors = checkPricing(state);
    results.push({ key: 'pricing', label: 'Pricing entries', info: `${state.pricingEntryCount} files`, errors: pricingErrors });

    const planErrors = checkSubscriptionPlans(state);
    results.push({
        key: 'plans',
        label: 'Subscription plans',
        info: `${state.planCount} plans`,
        errors: planErrors,
    });

    const aliasChecks = checkAliases(state);
    results.push({
        key: 'aliases',
        label: 'Aliases',
        info: `${state.aliasCount} entries`,
        errors: aliasChecks.errors,
        warnings: aliasChecks.warnings,
    });

    const gatingSet =
        options?.gatingSections && options.gatingSections.length > 0
            ? new Set<ValidationSectionKey>(options.gatingSections)
            : undefined;
    const relevantResults = gatingSet ? results.filter((result) => gatingSet.has(result.key)) : results;
    const success = relevantResults.every((result) => result.errors.length === 0);
    return { success, results };
}

const SECTION_PRESETS: Record<string, ValidationSectionKey[]> = {
    all: [...VALIDATION_SECTION_KEYS],
    structure: [
        'organisations',
        'families',
        'benchmarks',
        'apiProviders',
        'modelFiles',
        'apiProviderModels',
        'modelReferences',
        'plans',
        'aliases',
    ],
    pricing: ['pricing'],
};

const SECTION_KEY_LOOKUP = new Set<ValidationSectionKey>(VALIDATION_SECTION_KEYS);

function parseSectionListArg(value: string): ValidationSectionKey[] | undefined {
    const requested = value
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
    const parsed: ValidationSectionKey[] = [];
    for (const item of requested) {
        const key = item as ValidationSectionKey;
        if (!SECTION_KEY_LOOKUP.has(key)) {
            console.warn(`Ignoring unknown validation section '${item}'.`);
            continue;
        }
        if (!parsed.includes(key)) {
            parsed.push(key);
        }
    }
    return parsed.length > 0 ? parsed : undefined;
}

function resolveGatingSectionsFromArgs(args: string[]): ValidationSectionKey[] | undefined {
    let gatingSections: ValidationSectionKey[] | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg.startsWith('--preset=')) {
            const presetName = arg.slice('--preset='.length).trim().toLowerCase();
            const preset = SECTION_PRESETS[presetName];
            if (preset && preset.length > 0) {
                gatingSections = [...preset];
            } else if (presetName) {
                console.warn(`Unknown validation preset '${presetName}'. Falling back to all sections.`);
                gatingSections = undefined;
            }
        } else if (arg === '--preset') {
            const presetName = args[index + 1]?.trim().toLowerCase();
            if (!presetName) {
                console.warn('Missing value for --preset. Falling back to all sections.');
                continue;
            }
            index += 1;
            const preset = SECTION_PRESETS[presetName];
            if (preset && preset.length > 0) {
                gatingSections = [...preset];
            } else {
                console.warn(`Unknown validation preset '${presetName}'. Falling back to all sections.`);
                gatingSections = undefined;
            }
        } else if (arg.startsWith('--sections=')) {
            const sectionList = arg.slice('--sections='.length);
            gatingSections = parseSectionListArg(sectionList);
        } else if (arg === '--sections') {
            const sectionList = args[index + 1];
            if (!sectionList) {
                console.warn('Missing value for --sections. Falling back to all sections.');
                continue;
            }
            index += 1;
            gatingSections = parseSectionListArg(sectionList);
        }
    }
    return gatingSections;
}

function logValidationResults(outcome: ReturnType<typeof runWebDataValidation>, gatingSections?: ValidationSectionKey[]) {
    const gatingSet =
        gatingSections && gatingSections.length > 0 ? new Set<ValidationSectionKey>(gatingSections) : undefined;
    const displayResults = gatingSet ? outcome.results.filter((result) => gatingSet.has(result.key)) : outcome.results;
    const totalErrors = displayResults.reduce((count, result) => count + result.errors.length, 0);
    const totalWarnings = displayResults.reduce((count, result) => count + (result.warnings?.length ?? 0), 0);
    const header =
        totalErrors === 0
            ? `✅ Data validation succeeded across ${displayResults.length} enforced checks.`
            : `❌ Data validation reported ${totalErrors} error${totalErrors === 1 ? '' : 's'} across ${displayResults.length} enforced sections.`;
    console.log(header);
    if (totalWarnings > 0) {
        console.warn(
            `⚠️ Data validation reported ${totalWarnings} non-blocking warning${totalWarnings === 1 ? '' : 's'}.`
        );
    }

    for (const result of displayResults) {
        const status = result.errors.length === 0 ? '✅' : '❌';
        const badge = result.info ? ` (${result.info})` : '';
        console.log(`${status} ${result.label}${badge}`);

        if (result.errors.length > 0) {
            for (const err of result.errors) {
                console.log(`   • ${err}`);
            }
        }
        if ((result.warnings?.length ?? 0) > 0) {
            for (const warning of result.warnings ?? []) {
                console.log(`   ⚠ ${warning}`);
            }
        }
    }

    if (!outcome.success) {
        console.error('❌ Data validation failed. Fix the highlighted sections before proceeding.');
    }
}

const VALIDATE_SCRIPT_PATH = path.resolve(fileURLToPath(import.meta.url));
const CLI_ENTRY_PATH = process.argv[1] ? path.resolve(process.argv[1]) : null;
const IS_DIRECT_CLI_RUN = CLI_ENTRY_PATH === VALIDATE_SCRIPT_PATH;

if (IS_DIRECT_CLI_RUN) {
    const gatingSections = resolveGatingSectionsFromArgs(process.argv.slice(2));
    const outcome = runWebDataValidation({ gatingSections });
    logValidationResults(outcome, gatingSections);
    if (!outcome.success) {
        process.exit(1);
    }
}
