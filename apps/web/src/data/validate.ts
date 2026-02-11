import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

const KNOWN_METERS = new Set<string>([
    'input_text_tokens',
    'input_image',
    'input_image_tokens',
    'input_video_seconds',
    'input_video_tokens',
    'input_audio_tokens',
    'output_text_tokens',
    'output_image_tokens',
    'output_video_tokens',
    'output_video_seconds',
    'output_audio_tokens',
    'output_image',
    'cached_write_tokens',
    'cached_write_text_tokens',
    'cached_read_text_tokens',
    'cached_read_image_tokens',
    'cached_read_video_tokens',
    'cached_read_audio_tokens',
    'embedding_tokens',
    'requests',
    'total_tokens',
]);

const ALLOWED_BILL_MODES = new Set<string>(['all', 'over', 'between']);

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
        /pricing.*unknown meter/i,
        /pricing.*non-positive price/i,
        /pricing.*unit_size.*invalid/i,
        /pricing.*bill mode.*invalid/i,
        /pricing.*effective_to.*before.*effective_from/i,
    ];
    return majorPatterns.some((p) => p.test(msg));
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
        for (const r of p.rules) {
            const meter = r?.meter;
            if (typeof meter !== 'string' || !KNOWN_METERS.has(meter)) {
                errs.push(`pricing: unknown meter '${meter}' for ${api_provider_id ?? '?'}:${model_id ?? '?'}:${endpoint ?? '?'}`);
                continue;
            }
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

const MODEL_DATE_FIELDS = ['announced_date', 'release_date', 'deprecation_date', 'retirement_date'];
const DETAIL_DATE_HINTS = ['date', 'cutoff'];

type ModelEntry = {
    filePath: string;
    data: Record<string, unknown>;
};

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
        if (typeof data.name !== 'string' || !data.name.trim()) {
            errors.push(`${label} missing a name`);
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
    structure: ['organisations', 'families', 'benchmarks', 'apiProviders', 'modelFiles', 'modelReferences', 'plans', 'aliases'],
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
    for (const arg of args) {
        if (arg.startsWith('--preset=')) {
            const presetName = arg.slice('--preset='.length).trim().toLowerCase();
            const preset = SECTION_PRESETS[presetName];
            if (preset && preset.length > 0) {
                gatingSections = [...preset];
            } else if (presetName) {
                console.warn(`Unknown validation preset '${presetName}'. Falling back to all sections.`);
                gatingSections = undefined;
            }
        } else if (arg.startsWith('--sections=')) {
            const sectionList = arg.slice('--sections='.length);
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

if ('main' in import.meta && (import.meta as ImportMeta & { main?: unknown }).main) {
    const gatingSections = resolveGatingSectionsFromArgs(process.argv.slice(2));
    const outcome = runWebDataValidation({ gatingSections });
    logValidationResults(outcome, gatingSections);
    if (!outcome.success) {
        process.exit(1);
    }
}
