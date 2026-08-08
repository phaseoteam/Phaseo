import { assertOk, client, isDryRun, logWrite } from "./supa";
import { chunk } from "./util";
import { DATA_ROOT, DIR_ALIASES } from "./paths";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

type DbClient = ReturnType<typeof client>;

const PAGE_SIZE = 1_000;

function asText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTextArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(asText).filter((item): item is string => Boolean(item));
    const text = asText(value);
    return text ? text.split(",").map(item => item.trim()).filter(Boolean) : [];
}

export function catalogueStatus(value: unknown): string {
    switch (String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")) {
        case "rumoured": return "rumoured";
        case "announced": return "announced";
        case "preview": return "preview";
        case "available": return "available";
        case "limited_access": return "limited_access";
        case "deprecated": return "deprecated";
        case "retired": return "retired";
        case "withheld": return "withheld";
        default: return "unknown";
    }
}

function modelStatus(value: unknown): string {
    switch (catalogueStatus(value)) {
        case "retired": return "retired";
        case "deprecated": return "deprecated";
        case "withheld": return "disabled";
        case "announced":
        case "rumoured": return "draft";
        default: return "active";
    }
}

function providerStatus(value: unknown): string {
    switch (String(value ?? "").trim().toLowerCase()) {
        case "alpha": return "alpha";
        case "beta": return "beta";
        case "notready": return "not_ready";
        case "disabled": return "disabled";
        case "deprecated": return "deprecated";
        case "external": return "external";
        default: return "active";
    }
}

export function routeStatus(value: unknown, isActiveGateway = false): string {
    switch (String(value ?? "").trim().toLowerCase()) {
        case "disabled": return "disabled";
        case "retired": return "retired";
        case "active": return "active";
        case "degraded":
        case "deranked_lvl1":
        case "deranked_lvl2":
        case "deranked_lvl3": return "degraded";
        default: return isActiveGateway ? "active" : "degraded";
    }
}

const PROVIDER_AVAILABILITY_STATUSES = new Set([
    "unknown",
    "coming_soon",
    "preview",
    "available",
    "limited_access",
    "deprecated",
    "removed",
]);

const PHASEO_STATUSES = new Set([
    "unsupported",
    "planned",
    "implementing",
    "testing",
    "enabled",
    "disabled",
    "blocked",
]);

const ROUTE_ACCESS_SCOPES = new Set(["public", "internal"]);

function normalizedStatus(value: unknown): string {
    return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function routeCapabilities(row: Record<string, any>): Record<string, any>[] {
    return Array.isArray(row.capabilities) ? row.capabilities : [];
}

export function providerAvailabilityStatus(row: Record<string, any>): string {
    const explicitValue = row.provider_status ?? row.provider_availability_status;
    const explicit = normalizedStatus(explicitValue);
    if (PROVIDER_AVAILABILITY_STATUSES.has(explicit)) return explicit;
    if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "unknown";
    const routing = normalizedStatus(row.routing_status);
    if (routing === "retired") return "removed";
    if (routeCapabilities(row).some(capability => normalizedStatus(capability.status) === "coming_soon")) {
        return "coming_soon";
    }
    return "available";
}

export function phaseoStatus(row: Record<string, any>, providerIsExternal = false): string {
    const explicitValue = row.phaseo_status;
    const explicit = normalizedStatus(explicitValue);
    if (PHASEO_STATUSES.has(explicit)) return explicit;
    if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "disabled";
    if (providerIsExternal || row.routable === false) return "unsupported";
    const capabilities = routeCapabilities(row).map(capability => normalizedStatus(capability.status));
    if (capabilities.includes("internal_testing")) return "testing";
    if (capabilities.includes("coming_soon")) return "planned";
    const routing = normalizedStatus(row.routing_status);
    if (Boolean(row.is_active_gateway) && !["disabled", "retired"].includes(routing)) return "enabled";
    return "disabled";
}

export function routeAccessScope(row: Record<string, any>, providerIsExternal = false): string {
    const explicitValue = row.access_scope;
    const explicit = normalizedStatus(explicitValue);
    if (ROUTE_ACCESS_SCOPES.has(explicit)) return explicit;
    if (explicitValue !== null && explicitValue !== undefined && explicit !== "") return "internal";
    return phaseoStatus(row, providerIsExternal) === "testing" ? "internal" : "public";
}

export function phaseoRoutingEnabled(row: Record<string, any>, providerIsExternal = false): boolean {
    return phaseoStatus(row, providerIsExternal) === "enabled"
        && routeAccessScope(row, providerIsExternal) === "public"
        && ["available", "preview", "limited_access"].includes(providerAvailabilityStatus(row))
        && !["disabled", "retired"].includes(normalizedStatus(row.routing_status));
}

export function v2RouteExecutionRegions(
    providerRegions: unknown,
    providerModel: Record<string, any> | null | undefined,
): string[] {
    const modelRegions = asTextArray(providerModel?.regions?.execution);
    const selected = modelRegions.length ? modelRegions : asTextArray(providerRegions);
    return [...new Set(selected.map(region => region.toLowerCase()))];
}

function slug(value: unknown, fallback = "standard"): string {
    const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || fallback;
}

function stableUuid(value: string): string {
    const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
    hash[12] = "4";
    hash[16] = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
    const compact = hash.join("");
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function shortHash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function validateJsonPricingRules(rules: Record<string, any>[]): void {
    const rates = new Map<string, Record<string, any>>();
    for (const rule of rules) {
        const identity = stableJson({
            model_key: rule.model_key,
            operation: rule.capability_id ?? "inference",
            service_tier: slug(rule.pricing_plan),
            region: rule.region ?? null,
            currency: rule.currency ?? "USD",
            effective_from: rule.effective_from ?? "1970-01-01T00:00:00Z",
            effective_to: rule.effective_to ?? null,
            match: rule.match ?? rule.conditions ?? [],
            billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
            time_windows: rule.time_windows ?? [],
            priority: rule.priority ?? 100,
            meter_key: slug(rule.meter, "meter"),
        });
        const comparable = {
            unit: rule.unit ?? "unit",
            unit_size: Number(rule.unit_size ?? 1),
            price_per_unit: Number(rule.price_per_unit ?? 0),
            included_quantity: Number(rule.included_quantity ?? 0),
        };
        const previous = rates.get(identity);
        if (previous && stableJson(previous.comparable) !== stableJson(comparable)) {
            throw new Error(
                `Conflicting JSON pricing rates for ${String(rule.model_key)} / ${String(rule.meter)}: ${String(previous.sourceKey)} and ${String(rule.source_key)}`,
            );
        }
        rates.set(identity, { comparable, sourceKey: rule.source_key });
    }
}

export function v2PricingMeterMetadata(rule: Record<string, any>): Record<string, any> {
    return {
        source: "json",
        source_key: rule.source_key ?? rule.rule_id,
        note: rule.note ?? null,
        priority: rule.priority ?? 100,
        billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
        time_windows: rule.time_windows ?? [],
        ...(rule.included_quantity === undefined
            ? {}
            : { included_quantity: Number(rule.included_quantity) }),
    };
}

export function isFreeModelVariant(value: unknown): boolean {
    return String(value ?? "").trim().toLowerCase().endsWith(":free");
}

export function v2RouteModelSlug(
    row: Record<string, any>,
    canonicalModelSlug: (value: unknown) => string,
    authoredProviderModel?: Record<string, any>,
): string {
    const authoredModelSlug = asText(authoredProviderModel?.canonical_model_id);
    if (authoredModelSlug) return authoredModelSlug;
    if (isFreeModelVariant(row.api_model_id)) {
        throw new Error(
            `Free provider route ${String(row.provider_api_model_id ?? row.api_model_id)} is missing authored canonical_model_id`,
        );
    }
    const baseModelSlug = canonicalModelSlug(
        row.model_id ?? row.internal_model_id ?? row.api_model_id,
    );
    return baseModelSlug;
}

export function mergeProviderModels(
    legacyProviderModels: Record<string, any>[],
    authoredProviderModels: Map<string, Record<string, any>>,
): Record<string, any>[] {
    const rowsById = new Map(
        legacyProviderModels.map(row => [String(row.provider_api_model_id), row]),
    );
    for (const [providerModelId, authored] of authoredProviderModels) {
        rowsById.set(providerModelId, {
            ...(rowsById.get(providerModelId) ?? {}),
            ...authored,
        });
    }
    return [...rowsById.values()];
}

export function pricingModelPart(modelKey: string): { providerSlug: string; apiModelId: string } | null {
    const firstColon = modelKey.indexOf(":");
    const lastColon = modelKey.lastIndexOf(":");
    if (firstColon <= 0 || lastColon <= firstColon + 1) return null;
    const providerSlug = modelKey.slice(0, firstColon);
    return {
        providerSlug,
        apiModelId: modelKey.slice(firstColon + 1, lastColon),
    };
}

export type V2ModelPreflightIssue = {
    source_type: string;
    source_key: string;
    issue_code: string;
    details: Record<string, unknown>;
};

export type V2ModelPreflight = {
    models: Record<string, any>[];
    modelSlugAliases: Map<string, string>;
    issues: V2ModelPreflightIssue[];
};

export type V2BenchmarkPreflight = {
    rows: Record<string, any>[];
    issues: V2ModelPreflightIssue[];
};

function validCanonicalSlug(modelSlug: string, labSlug: string): boolean {
    const [prefix, suffix] = modelSlug.split("/", 2);
    return prefix === labSlug && Boolean(suffix);
}

export function preflightV2Models(
    legacyModels: Record<string, any>[],
    authoredAliases: Map<string, string>,
): V2ModelPreflight {
    const modelSlugAliases = new Map<string, string>();
    const issues: V2ModelPreflightIssue[] = [];
    const canonicalModels = new Map<string, Record<string, any>>();

    for (const row of legacyModels) {
        const legacySlug = String(row.model_id ?? "").trim();
        const labSlug = String(row.organisation_id ?? "").trim();
        if (!legacySlug) continue;

        const authoredCanonicalSlug = authoredAliases.get(legacySlug) ?? legacySlug;
        const canonicalSlug = authoredCanonicalSlug.trim();
        if (!validCanonicalSlug(canonicalSlug, labSlug)) {
            issues.push({
                source_type: "v2_model_preflight",
                source_key: legacySlug,
                issue_code: "unresolved_model_slug_prefix",
                details: { model_slug: legacySlug, lab_slug: labSlug, authored_canonical_slug: canonicalSlug },
            });
            continue;
        }

        if (canonicalSlug !== legacySlug) modelSlugAliases.set(legacySlug, canonicalSlug);
        const existing = canonicalModels.get(canonicalSlug);
        if (existing && String(existing.model_id) !== legacySlug) {
            // Prefer the already-canonical legacy row. Both legacy rows remain untouched;
            // V2 receives one deterministic identity and the collision is auditable.
            if (String(existing.model_id) !== canonicalSlug) {
                canonicalModels.set(canonicalSlug, { ...row, model_id: canonicalSlug });
            }
            issues.push({
                source_type: "v2_model_preflight",
                source_key: legacySlug,
                issue_code: "canonical_model_duplicate",
                details: { model_slug: legacySlug, canonical_model_slug: canonicalSlug },
            });
            continue;
        }
        canonicalModels.set(canonicalSlug, { ...row, model_id: canonicalSlug });
    }

    return { models: [...canonicalModels.values()], modelSlugAliases, issues };
}

export function preflightV2Benchmarks(
    legacyResults: Record<string, any>[],
    benchmarkIds: Set<string>,
    modelSlugs: Set<string>,
    canonicalModelSlug: (value: unknown) => string,
): V2BenchmarkPreflight {
    const issues: V2ModelPreflightIssue[] = [];
    const rows = legacyResults.flatMap(row => {
        const modelSlug = canonicalModelSlug(row.model_id);
        const benchmarkId = String(row.benchmark_id ?? "");
        if (!modelSlugs.has(modelSlug) || !benchmarkIds.has(benchmarkId)) {
            issues.push({
                source_type: "v2_benchmark_preflight",
                source_key: String(row.id ?? row.result_key ?? ""),
                issue_code: !modelSlugs.has(modelSlug) ? "unresolved_benchmark_model" : "unresolved_benchmark_id",
                details: { model_id: row.model_id, canonical_model_slug: modelSlug, benchmark_id: benchmarkId },
            });
            return [];
        }
        return [{
            result_id: row.id,
            model_slug: modelSlug,
            benchmark_id: benchmarkId,
            score: row.score ?? null,
            score_numeric: row.score_numeric ?? null,
            is_self_reported: Boolean(row.is_self_reported),
            other_info: row.other_info ?? null,
            source_link: row.source_link ?? null,
            rank: row.rank ?? null,
            occur_idx: row.occur_idx ?? null,
            variant: row.variant ?? null,
            result_key: row.result_key ?? null,
            created_at: row.created_at ?? null,
            updated_at: row.updated_at ?? null,
        }];
    });
    return { rows, issues };
}

async function fetchAll(supa: DbClient, table: string, columns = "*"): Promise<Record<string, any>[]> {
    const rows: Record<string, any>[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const result = await supa.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
        const page = assertOk(result, `v2 sync select ${table}`) as Record<string, any>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
    }
}

async function upsertChunks(
    supa: DbClient,
    table: string,
    rows: Record<string, any>[],
    onConflict: string,
) {
    for (const group of chunk(rows, 500)) {
        assertOk(
            await supa.from(table).upsert(group, { onConflict }),
            `v2 sync upsert ${table}`,
        );
    }
}

async function deleteByIds(
    supa: DbClient,
    table: string,
    idColumn: string,
    ids: string[],
) {
    for (const group of chunk(ids, 200)) {
        assertOk(
            await supa.from(table).delete().in(idColumn, group),
            `v2 sync delete stale ${table}`,
        );
    }
}

async function deleteByCompositeRows(
    supa: DbClient,
    table: string,
    identityFields: string[],
    rows: Record<string, any>[],
) {
    for (const row of rows) {
        let query = supa.from(table).delete();
        for (const field of identityFields) query = query.eq(field, row[field]);
        assertOk(await query, `v2 sync delete stale ${table}`);
    }
}

function childIdentity(row: Record<string, any>, identityFields: string[]): string {
    return JSON.stringify(identityFields.map(field => row[field] ?? null));
}

export function staleOwnedModelChildRows(
    existingRows: Record<string, any>[],
    desiredRows: Record<string, any>[],
    ownedModelSlugs: Set<string>,
    identityFields: string[],
): Record<string, any>[] {
    const desiredIdentities = new Set(desiredRows.map(row => childIdentity(row, identityFields)));
    return existingRows
        .filter(row => ownedModelSlugs.has(String(row.model_slug ?? "")))
        .filter(row => !desiredIdentities.has(childIdentity(row, identityFields)));
}

export function staleJsonProviderRouteIds(
    existingRows: Record<string, any>[],
    desiredRouteIds: Set<string>,
    excludedRouteIds: Set<string>,
): string[] {
    return existingRows
        .filter(row => ["json", "models.dev"].includes(String(row.metadata?.source ?? "")))
        .filter(row => !desiredRouteIds.has(String(row.provider_model_id)))
        .filter(row => !excludedRouteIds.has(String(row.provider_model_id)))
        .map(row => String(row.provider_model_id));
}

function sourceJsonMaps(): {
    organisations: Record<string, any>[];
    models: Map<string, Record<string, any>>;
    modelVariants: Map<string, Record<string, any>>;
    providers: Map<string, Record<string, any>>;
    providerModels: Map<string, Record<string, any>>;
    aliases: Map<string, string>;
    families: Record<string, any>[];
    aliasRows: Record<string, any>[];
    pricingRules: Record<string, any>[];
    capabilities: Record<string, any>[];
    benchmarks: Record<string, any>[];
    benchmarkResults: Record<string, any>[];
    subscriptionPlans: Record<string, any>[];
} {
    const organisations: Record<string, any>[] = [];
    const models = new Map<string, Record<string, any>>();
    const modelVariants = new Map<string, Record<string, any>>();
    const providers = new Map<string, Record<string, any>>();
    const providerModels = new Map<string, Record<string, any>>();
    const aliases = new Map<string, string>();
    const families: Record<string, any>[] = [];
    const aliasRows: Record<string, any>[] = [];
    const pricingRules: Record<string, any>[] = [];
    const capabilities: Record<string, any>[] = [];
    const benchmarks: Record<string, any>[] = [];
    const benchmarkResults: Record<string, any>[] = [];
    const subscriptionPlans: Record<string, any>[] = [];
    const providerRoot = join(DATA_ROOT, "api_providers");
    const aliasRoot = DIR_ALIASES;
    const modelRoot = join(DATA_ROOT, "models");
    for (const providerSlug of readdirSync(providerRoot)) {
        const providerDir = join(providerRoot, providerSlug);
        const providerPath = join(providerDir, "api_provider.json");
        if (existsSync(providerPath)) {
            const provider = JSON.parse(readFileSync(providerPath, "utf8")) as Record<string, any>;
            if (provider.api_provider_id) providers.set(String(provider.api_provider_id), provider);
        }
        const modelsPath = join(providerDir, "models.json");
        if (!existsSync(modelsPath)) continue;
        const entries = JSON.parse(readFileSync(modelsPath, "utf8")) as unknown;
        for (const entry of Array.isArray(entries) ? entries : []) {
            if (entry?.provider_api_model_id) {
                const canonicalModelId = asText(entry.canonical_model_id)
                    ?? asText(entry.internal_model_id)
                    ?? asText(entry.api_model_id);
                const providerModel = {
                    ...entry,
                    provider_id: providerSlug,
                    model_id: canonicalModelId,
                    internal_model_id: canonicalModelId,
                };
                providerModels.set(String(entry.provider_api_model_id), providerModel);
                for (const capability of Array.isArray(entry.capabilities) ? entry.capabilities : []) {
                    if (!capability?.capability_id) continue;
                    capabilities.push({
                        provider_api_model_id: entry.provider_api_model_id,
                        capability_id: capability.capability_id,
                        status: capability.status ?? "active",
                        max_input_tokens: capability.max_input_tokens ?? null,
                        max_output_tokens: capability.max_output_tokens ?? null,
                        params: capability.params ?? {},
                        notes: capability.notes ?? null,
                    });
                }
            }
        }
    }
    const walk = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith(".json")) {
                const model = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
                if (model.model_id) {
                    models.set(String(model.model_id), model);
                    for (const [index, result] of (Array.isArray(model.benchmarks) ? model.benchmarks : []).entries()) {
                        if (!result?.benchmark_id) continue;
                        const resultKey = `${model.model_id}:${result.benchmark_id}:${result.variant ?? ""}:${index}`;
                        benchmarkResults.push({
                            id: stableUuid(`benchmark-result:${resultKey}`),
                            model_id: model.model_id,
                            benchmark_id: result.benchmark_id,
                            score: result.score === null || result.score === undefined ? null : String(result.score),
                            score_numeric: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
                            is_self_reported: Boolean(result.is_self_reported),
                            other_info: result.other_info ?? null,
                            source_link: result.source_link ?? null,
                            rank: result.rank ?? null,
                            occur_idx: index,
                            variant: result.variant ?? null,
                            result_key: resultKey,
                        });
                    }
                    for (const variant of Array.isArray(model.variants) ? model.variants : []) {
                        if (!variant?.model_id) continue;
                        modelVariants.set(String(variant.model_id), {
                            ...variant,
                            base_model_id: model.model_id,
                        });
                    }
                }
            }
        }
    };
    walk(modelRoot);
    for (const aliasDir of readdirSync(aliasRoot)) {
        const aliasPath = join(aliasRoot, aliasDir, "alias.json");
        if (!existsSync(aliasPath)) continue;
        const alias = JSON.parse(readFileSync(aliasPath, "utf8")) as Record<string, any>;
        if (alias.is_enabled === false) continue;
        if (alias.alias_slug && alias.resolved_model_id) {
            aliases.set(String(alias.alias_slug), String(alias.resolved_model_id));
            aliasRows.push({
                alias_slug: alias.alias_slug,
                api_model_id: alias.resolved_model_id,
                channel: alias.channel ?? "public",
                is_enabled: alias.is_enabled !== false,
            });
        }
    }

    const readFlatJson = (root: string, filename: string): Record<string, any>[] => {
        if (!existsSync(root)) return [];
        const rows: Record<string, any>[] = [];
        const walk = (directory: string) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const file = join(directory, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (entry.name === filename) rows.push(JSON.parse(readFileSync(file, "utf8")) as Record<string, any>);
            }
        };
        walk(root);
        return rows;
    };

    organisations.push(...readFlatJson(join(DATA_ROOT, "organisations"), "organisation.json"));
    families.push(...readFlatJson(join(DATA_ROOT, "families"), "family.json"));
    for (const benchmark of readFlatJson(join(DATA_ROOT, "benchmarks"), "benchmark.json")) {
        benchmarks.push({
            id: benchmark.benchmark_id,
            name: benchmark.benchmark_name,
            category: benchmark.category ?? null,
            link: benchmark.link ?? null,
            total_models: benchmark.total_models ?? null,
            ascending_order: benchmark.ascending_order ?? false,
            type: benchmark.type ?? null,
        });
    }
    subscriptionPlans.push(...readFlatJson(join(DATA_ROOT, "subscription_plans"), "plan.json"));
    for (const pricing of readFlatJson(join(DATA_ROOT, "pricing"), "pricing.json")) {
        for (const [index, rule] of (Array.isArray(pricing.rules) ? pricing.rules : []).entries()) {
            const sourceKey = `${pricing.key}:${index}:${rule.meter}:${rule.pricing_plan ?? "standard"}`;
            pricingRules.push({
                ...rule,
                rule_id: stableUuid(`pricing-rule:${sourceKey}`),
                model_key: pricing.key,
                capability_id: pricing.capability_id ?? "inference",
                currency: rule.currency ?? "USD",
                region: rule.region ?? null,
                source_key: sourceKey,
            });
        }
    }
    return {
        organisations,
        models,
        modelVariants,
        providers,
        providerModels,
        aliases,
        families,
        aliasRows,
        pricingRules,
        capabilities,
        benchmarks,
        benchmarkResults,
        subscriptionPlans,
    };
}

function uniqueRows(rows: Record<string, any>[], key: (row: Record<string, any>) => string): Record<string, any>[] {
    const unique = new Map<string, Record<string, any>>();
    for (const row of rows) unique.set(key(row), row);
    return [...unique.values()];
}

export async function syncV2Catalogue(): Promise<void> {
    const supa = client();
    const source = sourceJsonMaps();

    const organisations = source.organisations;
    const models = [...source.models.values()];
    const providers = [...source.providers.values()];
    const providerModels = [...source.providerModels.values()];
    const aliases = source.aliasRows;
    const pricingRules = source.pricingRules;
    const capabilities = source.capabilities;
    const benchmarks = source.benchmarks;
    const benchmarkResults = source.benchmarkResults;

    validateJsonPricingRules(pricingRules);

    const organisationIds = new Set(organisations.map(row => String(row.organisation_id)));

    const modelPreflight = preflightV2Models(models, source.aliases);
    const canonicalModels = modelPreflight.models;
    const modelSlugAliases = modelPreflight.modelSlugAliases;
    const canonicalModelSlug = (value: unknown) => modelSlugAliases.get(String(value ?? "").trim()) ?? String(value ?? "").trim();
    const modelById = new Map(canonicalModels.map(row => [String(row.model_id), row]));
    const benchmarkRows = benchmarks.map(row => ({
        benchmark_id: row.id,
        name: row.name,
        category: row.category ?? null,
        link: row.link ?? null,
        total_models: row.total_models ?? null,
        ascending_order: row.ascending_order ?? false,
        benchmark_type: row.type ?? null,
        created_at: row.created_at ?? "1970-01-01T00:00:00Z",
        updated_at: row.updated_at ?? "1970-01-01T00:00:00Z",
    }));
    const benchmarkPreflight = preflightV2Benchmarks(
        benchmarkResults,
        new Set(benchmarkRows.map(row => String(row.benchmark_id))),
        new Set(modelById.keys()),
        canonicalModelSlug,
    );

    if (isDryRun()) {
        logWrite("public.v2_*", "SYNC", {
            source: "repository JSON",
            authored_models: models.length,
            canonical_models: canonicalModels.length,
            authored_variant_models: source.modelVariants.size,
            canonicalized_models: modelSlugAliases.size,
            benchmark_results: benchmarkResults.length,
            preflight_issues: [...modelPreflight.issues, ...benchmarkPreflight.issues],
        });
        return;
    }

    if (modelPreflight.issues.length) {
        await upsertChunks(supa, "v2_catalogue_backfill_issues", modelPreflight.issues, "source_type,source_key,issue_code");
    }
    const providerModelByApiKey = new Map<string, Record<string, any>>();
    for (const row of providerModels) {
        const key = `${row.provider_id}:${row.api_model_id}`;
        const previous = providerModelByApiKey.get(key);
        const isExactRoute = row.provider_api_model_id === key;
        const previousIsExactRoute = previous?.provider_api_model_id === key;
        if (!previous || isExactRoute || (!previousIsExactRoute && Boolean(row.is_active_gateway) && !Boolean(previous.is_active_gateway))) {
            providerModelByApiKey.set(key, row);
        }
    }

    await upsertChunks(supa, "v2_labs", organisations.map(row => ({
        lab_slug: row.organisation_id,
        name: row.name,
        country_code: asText(row.country_code) ?? "xx",
        description: row.description ?? null,
        status: "active",
        routable: false,
        metadata: {
            source: "json",
            legacy_organisation_id: row.organisation_id,
            colour: row.colour ?? null,
            display_name: row.name ?? null,
        },
    })), "lab_slug");

    const baseModelRows = canonicalModels.filter(row => organisationIds.has(String(row.organisation_id))).map(row => ({
        model_slug: row.model_id,
        lab_slug: row.organisation_id,
        name: row.name,
        description: row.description ?? null,
        status: modelStatus(row.status),
        catalogue_status: catalogueStatus(row.status),
        hidden: Boolean(row.hidden),
        input_modalities: asTextArray(row.input_types).map(value => value.toLowerCase()),
        output_modalities: asTextArray(row.output_types).map(value => value.toLowerCase()),
        family_slug: row.family_id ?? null,
        previous_model_slug: canonicalModelSlug(row.previous_model_id) || null,
        removal_date: source.models.get(String(row.model_id))?.removal_date ?? null,
        replacement_model_slug: canonicalModelSlug(source.models.get(String(row.model_id))?.replacement_model_id) || null,
        license: row.license ?? null,
        license_url: source.models.get(String(row.model_id))?.license_url ?? null,
        announced_at: row.announcement_date ?? row.announced_date ?? null,
        released_at: row.release_date ?? null,
        deprecated_at: row.deprecation_date ?? null,
        retired_at: row.retirement_date ?? null,
        variant_kind: "standard",
        base_model_slug: null,
        metadata: {
            source: "json",
            legacy_model_id: row.model_id,
            legacy_api_model_id: row.api_model_id ?? null,
            license: row.license ?? null,
            license_url: source.models.get(String(row.model_id))?.license_url ?? null,
            model_type: source.models.get(String(row.model_id))?.model_type ?? null,
            knowledge_cutoff: source.models.get(String(row.model_id))?.knowledge_cutoff ?? null,
            limits: source.models.get(String(row.model_id))?.limits ?? null,
            modalities: source.models.get(String(row.model_id))?.modalities ?? null,
            reasoning: source.models.get(String(row.model_id))?.reasoning ?? null,
            capabilities: source.models.get(String(row.model_id))?.capabilities ?? null,
            open_weights: source.models.get(String(row.model_id))?.open_weights ?? null,
            sources: source.models.get(String(row.model_id))?.sources ?? [],
            verification: source.models.get(String(row.model_id))?.verification ?? null,
        },
    }));
    const baseModelRowsBySlug = new Map(baseModelRows.map(row => [String(row.model_slug), row]));
    const variantModelRows = [...source.modelVariants.values()].map(variant => {
        const baseModelSlug = canonicalModelSlug(variant.base_model_id);
        const base = baseModelRowsBySlug.get(baseModelSlug);
        if (!base) {
            throw new Error(`Authored model variant ${String(variant.model_id)} references missing base model ${baseModelSlug}`);
        }
        return {
            ...base,
            model_slug: String(variant.model_id),
            name: String(variant.name),
            variant_kind: String(variant.variant_kind),
            base_model_slug: baseModelSlug,
            metadata: {
                ...base.metadata,
                variant_kind: variant.variant_kind,
                base_model_slug: baseModelSlug,
                source: "json",
            },
        };
    });
    for (const row of variantModelRows) modelById.set(String(row.model_slug), row);
    await upsertChunks(supa, "v2_models", [...baseModelRows, ...variantModelRows], "model_slug");

    await upsertChunks(supa, "v2_model_families", source.families.map(family => ({
        family_slug: family.family_id,
        lab_slug: family.organisation_id,
        name: family.family_name ?? family.family_id,
        metadata: { source: "json" },
    })), "family_slug");
    await upsertChunks(supa, "v2_lab_links", uniqueRows(organisations.flatMap(organisation =>
        (Array.isArray(organisation.organisation_links) ? organisation.organisation_links : []).flatMap((link: Record<string, any>) =>
            link?.platform && link?.url ? [{
                lab_slug: organisation.organisation_id,
                platform: String(link.platform),
                url: String(link.url),
            }] : [],
        ),
    ), row => `${row.lab_slug}:${row.platform}:${row.url}`), "lab_slug,platform,url");
    const ownedModelSlugs = new Set(source.models.keys());
    const modelLinkRows = uniqueRows([...source.models.values()].flatMap(model =>
        (Array.isArray(model.links) ? model.links : []).flatMap((link: Record<string, any>) => {
            const kind = asText(link.kind ?? link.platform);
            const url = asText(link.url);
            if (!kind || !url) return [];
            return [{
                model_slug: model.model_id,
                link_kind: slug(kind),
                title: asText(link.title) ?? kind.replace(/[_-]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()),
                url,
                metadata: { source: "json" },
            }];
        }),
    ), row => `${row.model_slug}:${row.link_kind}:${row.url}`);
    await upsertChunks(supa, "v2_model_links", modelLinkRows, "model_slug,link_kind,url");
    const existingModelLinks = await fetchAll(supa, "v2_model_links", "model_slug,link_kind,url,metadata");
    await deleteByCompositeRows(
        supa,
        "v2_model_links",
        ["model_slug", "link_kind", "url"],
        staleOwnedModelChildRows(
            existingModelLinks.filter(row => String(row.metadata?.source ?? "") === "json"),
            modelLinkRows,
            ownedModelSlugs,
            ["model_slug", "link_kind", "url"],
        ),
    );

    const modelDetailRows = uniqueRows([...source.models.values()].flatMap(model =>
        (Array.isArray(model.details) ? model.details : []).flatMap((detail: Record<string, any>, index: number) =>
            detail?.name ? [{
                model_slug: model.model_id,
                detail_name: String(detail.name),
                detail_value: detail.value ?? null,
                detail_order: index,
            }] : [],
        ),
    ), row => `${row.model_slug}:${row.detail_name}`);
    await upsertChunks(supa, "v2_model_details", modelDetailRows, "model_slug,detail_name");
    const existingModelDetails = await fetchAll(supa, "v2_model_details", "model_slug,detail_name");
    await deleteByCompositeRows(
        supa,
        "v2_model_details",
        ["model_slug", "detail_name"],
        staleOwnedModelChildRows(
            existingModelDetails,
            modelDetailRows,
            ownedModelSlugs,
            ["model_slug", "detail_name"],
        ),
    );

    const modelPageNoticeRows = uniqueRows([...source.models.values()].flatMap(model =>
        model.page_notice?.markdown ? [{
            model_slug: model.model_id,
            tone: model.page_notice.tone ?? "info",
            markdown: model.page_notice.markdown,
        }] : [],
    ), row => String(row.model_slug));
    await upsertChunks(supa, "v2_model_page_notices", modelPageNoticeRows, "model_slug");
    const existingModelPageNotices = await fetchAll(supa, "v2_model_page_notices", "model_slug");
    await deleteByIds(
        supa,
        "v2_model_page_notices",
        "model_slug",
        staleOwnedModelChildRows(
            existingModelPageNotices,
            modelPageNoticeRows,
            ownedModelSlugs,
            ["model_slug"],
        ).map(row => String(row.model_slug)),
    );

    const providersWithActiveRoutes = new Set(
        providerModels
            .filter(row => Boolean(row.is_active_gateway) && !["disabled", "retired"].includes(String(row.routing_status ?? "").toLowerCase()))
            .map(row => String(row.provider_id)),
    );
    const providerAvailabilityById = new Map(
        providers.map(provider => [String(provider.api_provider_id), provider.availability ?? null]),
    );
    const providerRows = providers.map(row => {
        const sourceProvider = source.providers.get(String(row.api_provider_id));
        const sourceRoutable = typeof sourceProvider?.routable === "boolean" ? sourceProvider.routable : null;
        const hasActiveRoute = providersWithActiveRoutes.has(String(row.api_provider_id));
        const routable = sourceRoutable ?? hasActiveRoute;
        const routingEnabled = sourceRoutable === false
            ? false
            : typeof sourceProvider?.routing_enabled === "boolean"
                ? sourceProvider.routing_enabled
                : hasActiveRoute;
        return {
        provider_slug: row.api_provider_id,
        lab_slug: organisationIds.has(String(row.api_provider_id))
            ? row.api_provider_id
            : organisationIds.has(String(row.provider_family_id))
                ? row.provider_family_id
                : null,
        name: row.api_provider_name,
        status: sourceRoutable === false ? "external" : providerStatus(row.status),
        routing_enabled: routingEnabled,
        routable,
        country_code: asText(row.country_code) ?? "xx",
        ...(sourceProvider?.stream_cancellation_support !== undefined ? {
            stream_cancellation_support: sourceProvider.stream_cancellation_support,
            stream_cancellation_stops_provider_billing:
                sourceProvider.stream_cancellation_stops_provider_billing ?? null,
            stream_cancellation_usage_recovery:
                sourceProvider.stream_cancellation_usage_recovery ?? "unknown",
            stream_cancellation_evidence_kind:
                sourceProvider.stream_cancellation_evidence_kind ?? "none",
            stream_cancellation_source_url:
                sourceProvider.stream_cancellation_source_url ?? null,
            stream_cancellation_verified_at:
                sourceProvider.stream_cancellation_verified_at ?? null,
        } : {}),
        metadata: {
            source: "json",
            legacy_provider_id: row.api_provider_id,
            provider_family_id: row.provider_family_id ?? null,
            description: row.description ?? null,
            link: row.link ?? null,
            colour: row.colour ?? null,
            prompt_training_policy: row.prompt_training_policy ?? null,
            residency_mode: row.residency_mode ?? null,
            default_execution_regions: row.default_execution_regions ?? null,
            default_data_regions: row.default_data_regions ?? null,
            gateway_kind: sourceProvider?.gateway_kind ?? null,
            routable: sourceProvider?.routable ?? null,
            routing_enabled: sourceProvider?.routing_enabled ?? null,
            sdk_package: sourceProvider?.sdk_package ?? null,
            api_base_url: sourceProvider?.api_base_url ?? null,
            docs_url: sourceProvider?.docs_url ?? null,
            auth_env: sourceProvider?.auth_env ?? null,
            api_formats: sourceProvider?.api_formats ?? [],
            service_tiers: sourceProvider?.service_tiers ?? [],
            sources: sourceProvider?.sources ?? [],
            verification: sourceProvider?.verification ?? null,
            availability:
                sourceProvider?.availability ??
                providerAvailabilityById.get(String(row.provider_family_id ?? "")) ??
                null,
        },
    }; });
    await upsertChunks(supa, "v2_providers", providerRows, "provider_slug");
    const routableLabs = new Set(providerRows.filter(row => row.routable && row.routing_enabled && row.status !== "disabled" && row.status !== "deprecated").map(row => String(row.lab_slug ?? "")));
    await upsertChunks(supa, "v2_labs", organisations.map(row => ({
        lab_slug: row.organisation_id,
        name: row.name,
        country_code: asText(row.country_code) ?? "xx",
        description: row.description ?? null,
        status: "active",
        routable: routableLabs.has(String(row.organisation_id)),
        metadata: {
            source: "json",
            legacy_organisation_id: row.organisation_id,
            colour: row.colour ?? null,
            display_name: row.name ?? null,
            routability_derived_from_provider_offers: true,
        },
    })), "lab_slug");

    const defaultProviderRegions = providerRows.flatMap(row => {
        const execution = asTextArray(row.metadata?.default_execution_regions);
        const data = new Set(asTextArray(row.metadata?.default_data_regions).map(value => value.toLowerCase()));
        return execution.map(region => ({
            provider_slug: row.provider_slug,
            region_code: region.toLowerCase(),
            display_name: region.toUpperCase(),
            execution_supported: true,
            data_residency_supported: data.has(region.toLowerCase()),
            status: row.status === "disabled" ? "disabled" : "active",
            routing_enabled: row.routing_enabled,
            metadata: { source: "json", default_execution_region: true },
        }));
    });
    const modelProviderRegions = providerModels
        .filter(row => Boolean(row.is_active_gateway) && !["disabled", "retired"].includes(String(row.routing_status ?? "").toLowerCase()))
        .flatMap(row => {
            const execution = asTextArray(row.regions?.execution);
            const data = new Set(asTextArray(row.regions?.data).map(value => value.toLowerCase()));
            return execution.map(region => ({
                provider_slug: row.provider_id,
                region_code: region.toLowerCase(),
                display_name: region.toUpperCase(),
                execution_supported: true,
                data_residency_supported: data.has(region.toLowerCase()),
                status: "active",
                routing_enabled: Boolean(row.is_active_gateway),
                metadata: {
                    source: "json",
                    default_execution_region: false,
                    provider_model_id: row.provider_api_model_id,
                },
            }));
        });
    const providerRegions = uniqueRows(
        [...defaultProviderRegions, ...modelProviderRegions],
        row => `${String(row.provider_slug)}:${String(row.region_code)}`,
    );
    await upsertChunks(supa, "v2_provider_regions", providerRegions, "provider_slug,region_code");

    const providerRegionsByProvider = new Map<string, string[]>();
    for (const region of providerRegions) {
        const regions = providerRegionsByProvider.get(region.provider_slug) ?? [];
        regions.push(region.region_code);
        providerRegionsByProvider.set(region.provider_slug, regions);
    }

    const providerStatusBySlug = new Map(providerRows.map(row => [String(row.provider_slug), String(row.status)]));
    const providerAvailabilityBySlug = new Map(
        providerRows.map(row => [String(row.provider_slug), row.metadata.availability ?? null]),
    );
    const routeRows = providerModels
        .filter(row => modelById.has(canonicalModelSlug(row.model_id ?? row.internal_model_id ?? row.api_model_id)))
        .map(row => {
            const authored = source.providerModels.get(String(row.provider_api_model_id));
            const statusSource = {
                ...row,
                provider_status: authored?.provider_status ?? row.provider_status,
                phaseo_status: authored?.phaseo_status ?? row.phaseo_status,
                access_scope: authored?.access_scope ?? row.access_scope,
                routable: authored?.routable ?? row.routable,
                capabilities: authored?.capabilities ?? row.capabilities ?? [],
            };
            const providerIsExternal = providerStatusBySlug.get(String(row.provider_id)) === "external";
            const upstreamStatus = providerAvailabilityStatus(statusSource);
            const integrationStatus = phaseoStatus(statusSource, providerIsExternal);
            const accessScope = routeAccessScope(statusSource, providerIsExternal);
            return {
                provider_model_id: row.provider_api_model_id,
                model_slug: v2RouteModelSlug(
                    row,
                    canonicalModelSlug,
                    authored,
                ),
                provider_slug: row.provider_id,
                provider_model_slug: row.provider_model_slug,
                status: routeStatus(row.routing_status, Boolean(row.is_active_gateway)),
                provider_availability_status: upstreamStatus,
                phaseo_status: integrationStatus,
                access_scope: accessScope,
                routing_enabled: phaseoRoutingEnabled(statusSource, providerIsExternal),
                input_modalities: asTextArray(row.input_modalities),
                output_modalities: asTextArray(row.output_modalities),
                context_length: Number(row.context_length) > 0 ? Number(row.context_length) : null,
                max_output_tokens: Number(row.max_output_tokens) > 0 ? Number(row.max_output_tokens) : null,
                effective_from: row.effective_from ?? null,
                effective_to: row.effective_to && row.effective_from && new Date(row.effective_to) <= new Date(row.effective_from) ? null : row.effective_to ?? null,
                regions: v2RouteExecutionRegions(
                    providerRegionsByProvider.get(String(row.provider_id)) ?? [],
                    authored,
                ),
                metadata: {
                    source: "json",
                    legacy_provider_api_model_id: row.provider_api_model_id,
                    quantization_scheme: row.quantization_scheme ?? null,
                    routing_status: authored?.routing_status ?? null,
                    routable: authored?.routable ?? null,
                    access_scope: authored?.access_scope ?? null,
                    regions: authored?.regions ?? null,
                    service_tiers: authored?.service_tiers ?? [],
                    api: authored?.api ?? null,
                    sources: authored?.sources ?? [],
                    verification: authored?.verification ?? null,
                    availability:
                        authored?.availability ??
                        providerAvailabilityBySlug.get(String(row.provider_id)) ??
                        null,
                },
            };
        });
    await upsertChunks(supa, "v2_model_provider_routes", routeRows, "provider_model_id");
    const desiredRouteIds = new Set(routeRows.map(row => String(row.provider_model_id)));
    const excludedRouteIds = new Set(
        providerModels
            .filter(row => !modelById.has(canonicalModelSlug(row.model_id ?? row.internal_model_id ?? row.api_model_id)))
            .map(row => String(row.provider_api_model_id ?? ""))
            .filter(Boolean),
    );
    const existingRouteRows = await fetchAll(supa, "v2_model_provider_routes", "provider_model_id,metadata");
    await deleteByIds(
        supa,
        "v2_model_provider_routes",
        "provider_model_id",
        staleJsonProviderRouteIds(existingRouteRows, desiredRouteIds, excludedRouteIds),
    );

    await upsertChunks(supa, "v2_route_capabilities", uniqueRows(capabilities
        .filter(row => providerModels.some(route => String(route.provider_api_model_id) === String(row.provider_api_model_id)))
        .map(row => ({
            provider_model_id: row.provider_api_model_id,
            capability_id: row.capability_id,
            status: String(row.status ?? "").toLowerCase() === "active"
                ? "active"
                : String(row.status ?? "").toLowerCase() === "disabled"
                    ? "disabled"
                    : String(row.status ?? "").toLowerCase() === "internal_testing" ? "internal_testing" : "degraded",
            max_input_tokens: row.max_input_tokens ?? null,
            max_output_tokens: row.max_output_tokens ?? null,
            params: row.params ?? {},
            effective_from: null,
            effective_to: null,
            metadata: {
                source: "json",
                notes: row.notes ?? null,
                capability_evidence: source.providerModels.get(String(row.provider_api_model_id))?.capabilities?.find((capability: Record<string, any>) => capability.capability_id === row.capability_id) ?? null,
            },
        })), row => `${row.provider_model_id}:${row.capability_id}`), "provider_model_id,capability_id");

    const authoredAliasRows = aliases.filter(row => modelById.has(canonicalModelSlug(row.api_model_id))).map(row => ({
        alias_slug: row.alias_slug,
        model_slug: canonicalModelSlug(row.api_model_id),
        alias_type: row.channel ?? "public",
        enabled: row.is_enabled !== false,
        metadata: { source: "json", legacy_api_model_id: row.api_model_id, legacy_channel: row.channel ?? null },
    }));
    const freeVariantAliasRows = providerModels.flatMap(row => {
        if (!isFreeModelVariant(row.api_model_id)) return [];
        const modelSlug = v2RouteModelSlug(
            row,
            canonicalModelSlug,
            source.providerModels.get(String(row.provider_api_model_id)),
        );
        const aliasSlug = String(row.api_model_id ?? "").trim().toLowerCase();
        if (!aliasSlug || aliasSlug === modelSlug || !source.modelVariants.has(modelSlug)) return [];
        return [{
            alias_slug: aliasSlug,
            model_slug: modelSlug,
            alias_type: "provider",
            enabled: true,
            metadata: {
                source: "json",
                provider_model_id: row.provider_api_model_id,
                free_variant_alias: true,
            },
        }];
    });
    const v2AliasRows = new Map<string, Record<string, any>>();
    for (const row of [...authoredAliasRows, ...freeVariantAliasRows]) {
        v2AliasRows.set(String(row.alias_slug), row);
    }
    await upsertChunks(
        supa,
        "v2_model_aliases",
        [...v2AliasRows.values()],
        "alias_slug",
    );

    const routeByProviderModelId = new Map<string, Record<string, any>>();
    for (const row of providerModels) routeByProviderModelId.set(String(row.provider_api_model_id), row);
    const pricingRowsByKey = new Map<string, Record<string, any>>();
    const pricingRuleSkuKey = new Map<string, string>();
    const unresolved: Record<string, any>[] = [];
    for (const rule of pricingRules) {
        const parsed = pricingModelPart(String(rule.model_key ?? ""));
        if (!parsed) continue;
        const providerModel = providerModelByApiKey.get(`${parsed.providerSlug}:${parsed.apiModelId}`);
        const route = providerModel ? routeByProviderModelId.get(String(providerModel.provider_api_model_id)) : null;
        if (!providerModel || !route || !modelById.has(String(route.model_id ?? route.internal_model_id ?? route.api_model_id))) {
            unresolved.push({ source_type: "pricing_rule", source_key: String(rule.rule_id), issue_code: "unresolved_provider_model", details: { model_key: rule.model_key } });
            continue;
        }
        const providerModelId = String(providerModel.provider_api_model_id);
        const normalizedMatch = rule.match ?? rule.conditions ?? [];
        const offerIdentity = stableJson({
            provider_model_id: providerModelId,
            operation: rule.capability_id ?? "inference",
            service_tier: slug(rule.pricing_plan),
            region: rule.region ?? null,
            currency: rule.currency ?? "USD",
            effective_from: rule.effective_from ?? "1970-01-01T00:00:00Z",
            effective_to: rule.effective_to ?? null,
            match: normalizedMatch,
            billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
            time_windows: rule.time_windows ?? [],
            priority: rule.priority ?? 100,
        });
        const skuCode = `offer-${shortHash(offerIdentity)}`;
        const skuLookupKey = `${providerModelId}:${skuCode}:1`;
        pricingRuleSkuKey.set(String(rule.rule_id), skuLookupKey);
        pricingRowsByKey.set(skuLookupKey, {
            provider_model_id: providerModelId,
            sku_code: skuCode,
            version: 1,
            service_tier_slug: slug(rule.pricing_plan),
            operation: rule.capability_id ?? "inference",
            status: rule.effective_to && new Date(rule.effective_to) <= new Date() ? "deprecated" : "active",
            display_name: rule.tier_label || `${slug(rule.pricing_plan)} ${rule.capability_id ?? "inference"}`,
            description: rule.note ?? null,
            currency: rule.currency ?? "USD",
            effective_from: rule.effective_from ?? "1970-01-01T00:00:00Z",
            effective_to: rule.effective_to && rule.effective_from && new Date(rule.effective_to) <= new Date(rule.effective_from) ? null : rule.effective_to ?? null,
            metadata: {
                source: "json",
                source_key: rule.source_key ?? rule.rule_id,
                model_key: rule.model_key,
                match: normalizedMatch,
                billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
                time_windows: rule.time_windows ?? [],
                priority: rule.priority ?? 100,
            },
        });
    }
    const pricingRows = [...pricingRowsByKey.values()];
    const tierSlugs = [...new Set(pricingRules.map(rule => slug(rule.pricing_plan)))];
    await upsertChunks(supa, "v2_service_tiers", tierSlugs.map(service_tier_slug => ({
        service_tier_slug,
        display_name: service_tier_slug.split(/[-_.:]+/g).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "),
        status: "active",
        metadata: { source: "json", legacy_pricing_plan: service_tier_slug },
    })), "service_tier_slug");

    await upsertChunks(supa, "v2_pricing_skus", pricingRows, "provider_model_id,sku_code,version");

    const routesForVariants = await fetchAll(supa, "v2_model_provider_routes", "provider_model_id,provider_slug,status,routing_enabled,regions");
    const variantRows = routesForVariants.flatMap(route => {
        const regions = asTextArray(route.regions)
            .filter(region => region !== "global");
        const sourceTiers = source.providerModels.get(String(route.provider_model_id))?.service_tiers;
        const routeTiers = Array.isArray(sourceTiers) && sourceTiers.length
            ? sourceTiers.map((tier: unknown) => slug(tier))
            : ["standard"];
        return routeTiers.flatMap(tier => {
            const global = [{
                provider_model_id: route.provider_model_id,
                variant_key: `global:${tier}`,
                service_tier_slug: tier,
                status: route.status,
                routing_enabled: Boolean(route.routing_enabled),
                endpoint_label: tier,
                metadata: { source: "json", scope: "global" },
            }];
            const regional = regions.map(region => ({
                provider_model_id: route.provider_model_id,
                variant_key: `region:${region}:${tier}`,
                execution_region: region,
                service_tier_slug: tier,
                status: route.status,
                routing_enabled: Boolean(route.routing_enabled),
                endpoint_label: `${region.toUpperCase()} ${tier}`,
                metadata: { source: "json", scope: "regional" },
            }));
            return [...global, ...regional];
        });
    });
    await upsertChunks(supa, "v2_route_variants", variantRows, "provider_model_id,variant_key");
    const desiredVariantKeys = new Set(
        variantRows.map(row => `${String(row.provider_model_id)}:${String(row.variant_key)}`),
    );
    const existingVariantRows = await fetchAll(
        supa,
        "v2_route_variants",
        "variant_id,provider_model_id,variant_key,metadata",
    );
    await deleteByIds(
        supa,
        "v2_route_variants",
        "variant_id",
        existingVariantRows
            .filter(row => ["json", "models.dev", "v2_provider_regions"].includes(String(row.metadata?.source ?? "")))
            .filter(row => !desiredVariantKeys.has(`${String(row.provider_model_id)}:${String(row.variant_key)}`))
            .map(row => String(row.variant_id)),
    );
    assertOk(
        await supa.rpc("refresh_v2_pricing_variant_links"),
        "v2 sync refresh pricing variant links",
    );

    const skuRows = await fetchAll(supa, "v2_pricing_skus", "sku_id,provider_model_id,sku_code,version");
    const skuByCode = new Map(skuRows.map(row => [`${row.provider_model_id}:${row.sku_code}:${row.version}`, row.sku_id]));
    const meterRowsByKey = new Map<string, Record<string, any>>();
    for (const rule of pricingRules) {
        const parsed = pricingModelPart(String(rule.model_key ?? ""));
        const providerModel = parsed ? providerModelByApiKey.get(`${parsed.providerSlug}:${parsed.apiModelId}`) : null;
        const skuId = providerModel ? skuByCode.get(pricingRuleSkuKey.get(String(rule.rule_id)) ?? "") : null;
        if (!skuId) continue;
        const meter = String(rule.meter ?? "meter");
        const lowerMeter = meter.toLowerCase();
        const row = {
            sku_id: skuId,
            meter_key: lowerMeter.replace(/[^a-z0-9._:-]+/g, "_"),
            modality: lowerMeter.includes("audio") ? "audio" : lowerMeter.includes("image") || lowerMeter.includes("pixel") ? "image" : lowerMeter.includes("video") || lowerMeter.includes("second") ? "video" : lowerMeter.includes("embedding") ? "embedding" : lowerMeter.includes("rerank") ? "rerank" : "text",
            direction: lowerMeter.startsWith("input_") || lowerMeter.startsWith("cached_") ? "input" : lowerMeter.startsWith("output_") ? "output" : null,
            unit: rule.unit ?? "unit",
            unit_quantity: rule.unit_size ?? 1,
            price_nanos: Number(rule.price_per_unit ?? 0) * 1_000_000_000,
            display_label: meter,
            display_unit: `${rule.unit_size ?? 1} ${rule.unit ?? "unit"}`,
            metadata: v2PricingMeterMetadata(rule),
        };
        const meterIdentity = `${row.sku_id}:${row.meter_key}`;
        const previous = meterRowsByKey.get(meterIdentity);
        const comparableRow = {
            ...row,
            metadata: { included_quantity: row.metadata.included_quantity ?? 0 },
        };
        const comparablePrevious = previous ? {
            ...previous,
            metadata: { included_quantity: previous.metadata?.included_quantity ?? 0 },
        } : null;
        if (comparablePrevious && stableJson(comparablePrevious) !== stableJson(comparableRow)) {
            throw new Error(
                `Conflicting JSON pricing rates for ${meterIdentity}: ${String(previous?.metadata?.source_key)} and ${String(row.metadata.source_key)}`,
            );
        }
        meterRowsByKey.set(meterIdentity, row);
    }
    const meterRows = [...meterRowsByKey.values()];
    const meterDefinitions = new Map<string, Record<string, any>>();
    for (const row of meterRows) {
        const existing = meterDefinitions.get(row.meter_key);
        if (existing && (existing.unit !== row.unit || existing.modality !== row.modality || existing.direction !== row.direction)) {
            throw new Error(`Meter ${row.meter_key} has inconsistent unit, modality, or direction in JSON pricing`);
        }
        meterDefinitions.set(row.meter_key, {
            meter_key: row.meter_key,
            display_name: row.display_label,
            modality: row.modality,
            direction: row.direction,
            unit: row.unit,
            default_unit_quantity: row.unit_quantity,
            status: "active",
            metadata: { source: "json" },
        });
    }
    await upsertChunks(supa, "v2_meter_definitions", [...meterDefinitions.values()], "meter_key");
    await upsertChunks(supa, "v2_pricing_sku_meters", meterRows, "sku_id,meter_key");

    const desiredSkuKeys = new Set(pricingRows.map(row => `${row.provider_model_id}:${row.sku_code}:${row.version}`));
    const staleSkuIds = skuRows
        .filter(row => !desiredSkuKeys.has(`${row.provider_model_id}:${row.sku_code}:${row.version}`))
        .map(row => String(row.sku_id));
    await deleteByIds(supa, "v2_pricing_skus", "sku_id", staleSkuIds);

    assertOk(
        await supa.from("v2_catalogue_backfill_issues").delete().eq("source_type", "pricing_rule"),
        "v2 sync clear resolved pricing issues",
    );
    if (unresolved.length) {
        await upsertChunks(supa, "v2_catalogue_backfill_issues", unresolved, "source_type,source_key,issue_code");
    }

    await upsertChunks(supa, "v2_benchmarks", benchmarkRows, "benchmark_id");

    await upsertChunks(supa, "v2_benchmark_results", benchmarkPreflight.rows, "result_id");
    const desiredBenchmarkResultIds = new Set(benchmarkPreflight.rows.map(row => String(row.result_id)));
    const existingBenchmarkResults = await fetchAll(supa, "v2_benchmark_results", "result_id");
    await deleteByIds(
        supa,
        "v2_benchmark_results",
        "result_id",
        existingBenchmarkResults
            .filter(row => !desiredBenchmarkResultIds.has(String(row.result_id)))
            .map(row => String(row.result_id)),
    );

    const subscriptionPlanRows = source.subscriptionPlans.flatMap(plan =>
        (Array.isArray(plan.pricing_options) && plan.pricing_options.length ? plan.pricing_options : [{}]).map((option: Record<string, any>) => ({
            plan_uuid: stableUuid(`subscription-plan:${plan.plan_id}:${option.frequency ?? "default"}`),
            plan_id: plan.plan_id,
            name: plan.name,
            lab_slug: plan.organisation_id ?? null,
            description: plan.description ?? null,
            frequency: option.frequency ?? null,
            price: option.usd_price ?? null,
            currency: option.currency ?? "USD",
            link: option.link ?? null,
            other_info: option.other_info ?? {},
        })),
    );
    await upsertChunks(supa, "v2_subscription_plans", subscriptionPlanRows, "plan_uuid");
    const subscriptionPlanById = new Map<string, Record<string, any>[]>();
    for (const row of subscriptionPlanRows) {
        const entries = subscriptionPlanById.get(String(row.plan_id)) ?? [];
        entries.push(row);
        subscriptionPlanById.set(String(row.plan_id), entries);
    }
    await upsertChunks(supa, "v2_subscription_plan_models", source.subscriptionPlans.flatMap(plan =>
        (subscriptionPlanById.get(String(plan.plan_id)) ?? []).flatMap(option =>
            (Array.isArray(plan.models) ? plan.models : []).flatMap((model: Record<string, any>) => {
                const modelSlug = canonicalModelSlug(model.model_id ?? model.model_slug);
                if (!modelById.has(modelSlug)) return [];
                return [{
                    plan_uuid: option.plan_uuid,
                    model_slug: modelSlug,
                    model_info: model.model_info ?? {},
                    rate_limit: model.rate_limit ?? {},
                    other_info: model.other_info ?? {},
                }];
            }),
        ),
    ), "plan_uuid,model_slug");
    await upsertChunks(supa, "v2_subscription_plan_features", source.subscriptionPlans.flatMap(plan =>
        (subscriptionPlanById.get(String(plan.plan_id)) ?? []).flatMap(option =>
            (Array.isArray(plan.features) ? plan.features : []).flatMap((feature: Record<string, any>) =>
                feature?.feature_name ? [{
                    plan_uuid: option.plan_uuid,
                    feature_name: feature.feature_name,
                    feature_value: feature.feature_value ?? null,
                    feature_description: feature.feature_description ?? null,
                    other_info: feature.other_info ?? {},
                }] : [],
            ),
        ),
    ), "plan_uuid,feature_name");

    const desiredModelSlugs = new Set([...baseModelRows, ...variantModelRows].map(row => String(row.model_slug)));
    const existingModels = await fetchAll(supa, "v2_models", "model_slug,metadata");
    await deleteByIds(
        supa,
        "v2_models",
        "model_slug",
        existingModels
            .filter(row => ["json", "models.dev"].includes(String(row.metadata?.source ?? "")))
            .filter(row => !desiredModelSlugs.has(String(row.model_slug)))
            .map(row => String(row.model_slug)),
    );

    const preflightIssues = [...modelPreflight.issues, ...benchmarkPreflight.issues];
    if (benchmarkPreflight.issues.length) {
        await upsertChunks(supa, "v2_catalogue_backfill_issues", benchmarkPreflight.issues, "source_type,source_key,issue_code");
    }
    console.log(`[v2-sync] models=${canonicalModels.length + variantModelRows.length} base_models=${canonicalModels.length} variant_models=${variantModelRows.length} routes=${providerModels.length} pricing_rules=${pricingRules.length} pricing_skus=${pricingRows.length} meter_definitions=${meterDefinitions.size} benchmarks=${benchmarkRows.length} benchmark_results=${benchmarkPreflight.rows.length} subscription_plans=${subscriptionPlanRows.length} preflight_issues=${preflightIssues.length} unresolved_pricing=${unresolved.length}`);
}
