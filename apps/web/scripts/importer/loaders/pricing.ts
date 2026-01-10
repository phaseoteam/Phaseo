import { join, basename } from "path";
import { DIR_PRICING } from "../paths";
import { listDirs, readJsonWithHash, chunk, toInList } from "../util";
import { client, isDryRun, logWrite, pruneRowsByColumn } from "../supa";
import { createHash } from "crypto";
import { ChangeTracker } from "../state";

function toFixed10(n: number) {
    // match numeric(20,10) for pricing rules storage
    return Number(n).toFixed(10);
}

function deepSortObjectKeys(x: any): any {
    if (Array.isArray(x)) {
        // preserve array order (priority often matters)
        return x.map(deepSortObjectKeys);
    }
    if (x && typeof x === "object") {
        const out: any = {};
        Object.keys(x).sort().forEach(k => { out[k] = deepSortObjectKeys(x[k]); });
        return out;
    }
    return x;
}

function digestRule(r: any) {
    // Create a stable digest for a rule using canonical fields
    const payload = {
        unit_size: r.unit_size ?? 1,
        price: toFixed10((r.price_per_unit ?? r.price_usd_per_unit ?? 0) as number),
        pricing_plan: r.pricing_plan ?? r.pricingPlan ?? null,
        tiering_mode: r.tiering_mode ?? r.tieringMode ?? null,
        note: r.note ?? null,
        conditions: deepSortObjectKeys(r.match ?? []),
    };
    return createHash("md5").update(JSON.stringify(payload)).digest("hex");
}

const norm = (arr?: string[]) => (arr && arr.length ? arr.join(",") : "");

type PricingJSON = {
    key: string;                      // provider:model:endpoint (not required by loader)
    api_provider_id: string;          // NOTE: matches provider_models column
    provider_slug: string;            // not stored
    api_model_id: string;
    internal_model_id: string;
    endpoint: string;
    provider_model_slug?: string | null;
    is_active_gateway: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    effective_from?: string | null;
    effective_to?: string | null;
    capability?: Record<string, unknown>;
    rules?: Array<{
        meter: string;
        unit?: string;
        unit_size?: number;
        price_per_unit?: number;
        price_usd_per_unit?: number;
        currency?: string;
        tiering_mode?: string;
        pricing_plan: string;
        note?: string | null;
        match?: PricingMatch[];             // conditions
        priority?: number;
    }>;
};

type PricingMatch = {
    path: string;
    op: string;
    or_group?: number;
    and_index?: number;
    value: string | number | Array<any>;
}

type EndpointState = {
    api_provider_id: string;
    endpoint: string;
    ruleReplacements: Array<{ model_key: string; rows: PricingRuleRow[] }>;
    dirtyModels: Array<{
        id?: string;
        api_provider_id: string;
        internal_model_id: string;
        api_model_id: string;
        provider_model_slug: string | null;
        endpoint: string;
        is_active_gateway: boolean;
        input_modalities: string;
        output_modalities: string;
        effective_from: string | null;
        effective_to: string | null;
    }>;
    keepInternalModelIds: Set<string>;
};

type PricingRuleRow = {
    model_key: string;
    pricing_plan: string;
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    tiering_mode: string | null;
    note: string | null;
    match: unknown[];
    priority: number;
};

function assertOk<T>(res: { data?: T; error?: any }, label: string) {
    if (res.error) {
        // eslint-disable-next-line no-console
        console.error(label, {
            message: res.error.message,
            details: res.error.details,
            hint: res.error.hint,
            code: res.error.code,
        });
        throw new Error(`${label}: ${res.error.message}`);
    }
    return res.data as T;
}

async function filterExistingModels(
    supa: any,
    models: Array<{ internal_model_id: string }>
) {
    const existing = new Set<string>();

    const uniqueIds = [...new Set(models.map(m => m.internal_model_id))];
    const chunks = chunk(uniqueIds, 500);
    for (const _ids of chunks) {
        const data: Array<{ model_id: string }> = assertOk(
            await supa
                .from("data_models")
                .select("model_id")
                .in("model_id", _ids),
            "select data_models (filter)"
        );

        for (const row of data ?? []) existing.add(row.model_id);
    }

    return models.filter(m => existing.has(m.internal_model_id));
}

export async function loadPricing(
    tracker: ChangeTracker,
    { modelId }: { modelId: string | null }
) {
    const supa = client();
    if (!modelId) tracker.touchPrefix(DIR_PRICING);
    const providerModelIds = new Set<string>();
    const pricingRuleKeys = new Set<string>();
    let hasChanges = false;

    const endpoints = new Map<string, EndpointState>();

    const providerDirs = await listDirs(DIR_PRICING);

    for (const provPath of providerDirs) {
        const api_provider_id = basename(provPath);
        const endpointDirs = await listDirs(provPath);
        for (const epPath of endpointDirs) {
            const endpoint = basename(epPath);
            const modelDirs = await listDirs(epPath);
            const endpointKey = `${api_provider_id}::${endpoint}`;

            const endpointState: EndpointState = endpoints.get(endpointKey) ?? {
                api_provider_id,
                endpoint,
                dirtyModels: [],
                keepInternalModelIds: new Set<string>(),
                ruleReplacements: [],
            };

            for (const mPath of modelDirs) {
                const fp = join(mPath, "pricing.json");
                const { data: j, hash } = await readJsonWithHash<PricingJSON>(fp);
                if (modelId && j.internal_model_id !== modelId) continue;
                const computedKey =
                    j.key && j.key.trim()
                        ? j.key
                        : `${j.api_provider_id}:${j.api_model_id}:${j.endpoint}`;
                const change = tracker.track(fp, hash, {
                    api_provider_id: j.api_provider_id,
                    endpoint: j.endpoint,
                    internal_model_id: j.internal_model_id,
                    api_model_id: j.api_model_id,
                    model_key: computedKey,
                });

                const provider_model_slug = (j.provider_model_slug ?? null);
                const id = computedKey; // table requires an `id` primary key; use composed key

                providerModelIds.add(id);
                endpointState.keepInternalModelIds.add(j.internal_model_id);

                const providerModelRow = {
                    id,
                    api_provider_id: j.api_provider_id,
                    internal_model_id: j.internal_model_id,
                    api_model_id: j.api_model_id,
                    provider_model_slug,
                    endpoint: j.endpoint,
                    is_active_gateway: !!j.is_active_gateway,
                    input_modalities: norm(j.input_modalities),
                    output_modalities: norm(j.output_modalities),
                    effective_from: j.effective_from ?? null,
                    effective_to: j.effective_to ?? null,
                };

                if (change.status !== "unchanged") {
                    endpointState.dirtyModels.push(providerModelRow);
                    hasChanges = true;
                }

                // Per-file duplicate handling (exact dupes get :occur suffix; near-dupes differ by hash)
                const ruleRows = j.rules || [];
                if (ruleRows.length) pricingRuleKeys.add(computedKey);

                const seenBuckets = new Map<string, number>(); // key: provider|model|ep|meter|prio|digest
                const desiredRules: PricingRuleRow[] = [];

                for (const r of ruleRows) {
                    const prio = r.priority ?? 100;
                    const digest = digestRule(r);
                    const bucket = `${j.api_provider_id}|${j.api_model_id}|${j.endpoint}|${r.meter}|${prio}|${digest}`;
                    const occur = (seenBuckets.get(bucket) ?? 0) + 1;
                    seenBuckets.set(bucket, occur);

                    // Map incoming fields to the DB schema
                    const pricing_plan = r.pricing_plan;
                    const unit = r.unit ?? "token";
                    const price_val = (r.price_per_unit ?? r.price_usd_per_unit ?? 0) as number;

                    desiredRules.push({
                        model_key: computedKey,
                        pricing_plan,
                        meter: r.meter,
                        unit: unit,
                        unit_size: r.unit_size ?? 1,
                        price_per_unit: toFixed10(price_val),
                        currency: r.currency ?? "USD",
                        tiering_mode: r.tiering_mode ?? null,
                        note: r.note ?? null,
                        match: r.match ?? [],
                        priority: prio,
                    });
                }

                if (change.status !== "unchanged") {
                    endpointState.ruleReplacements.push({ model_key: computedKey, rows: desiredRules });
                    hasChanges = true;
                }
            }

            endpoints.set(endpointKey, endpointState);
        }
    }

    const deleted = tracker
        .getDeleted(DIR_PRICING)
        .filter(d => !modelId || d.info.meta?.internal_model_id === modelId);
    if (deleted.length) hasChanges = true;
    const deletedByEndpoint = new Map<string, Array<{ model_key?: string; internal_model_id?: string }>>();
    for (const d of deleted) {
        const meta = d.info.meta || {};
        const api_provider_id = meta.api_provider_id;
        const endpoint = meta.endpoint;
        if (!api_provider_id || !endpoint) continue;
        const endpointKey = `${api_provider_id}::${endpoint}`;
        const arr = deletedByEndpoint.get(endpointKey) ?? [];
        arr.push({ model_key: meta.model_key, internal_model_id: meta.internal_model_id });
        deletedByEndpoint.set(endpointKey, arr);
    }

    for (const endpointKey of new Set([...endpoints.keys(), ...deletedByEndpoint.keys()])) {
        const endpointState = endpoints.get(endpointKey);
        const [api_provider_id, endpoint] = endpointKey.split("::");

        const keepInternalModelIds = endpointState
            ? [...endpointState.keepInternalModelIds]
            : [];

        const dirtyProviderModels = endpointState?.dirtyModels ?? [];
        const ruleReplacements = endpointState?.ruleReplacements ?? [];
        const deletedEntries = deletedByEndpoint.get(endpointKey) ?? [];

        const hasEndpointChanges =
            dirtyProviderModels.length > 0 ||
            ruleReplacements.length > 0 ||
            deletedEntries.length > 0;

        if (!hasEndpointChanges) continue;

        // ---- provider_models ----
        if (isDryRun()) {
            for (const r of dirtyProviderModels) {
                logWrite("public.data_api_provider_models", "UPSERT", r, {
                    onConflict: "api_provider_id,endpoint,api_model_id",
                });
            }
        } else if (dirtyProviderModels.length) {
            const existingModels = await filterExistingModels(supa, dirtyProviderModels);

            for (const group of chunk(existingModels, 500)) {
                assertOk(
                    await supa
                        .from("data_api_provider_models")
                        .upsert(group, { onConflict: "api_provider_id,endpoint,api_model_id" }),
                    "upsert data_api_provider_models"
                );
            }
        }

        // Delete rows for models removed from this endpoint
        if (!isDryRun()) {
            if (!modelId) {
                if (keepInternalModelIds.length) {
                    assertOk(
                        await supa
                            .from("data_api_provider_models")
                            .delete()
                            .eq("api_provider_id", api_provider_id)
                            .eq("endpoint", endpoint)
                            .not("internal_model_id", "in", toInList(keepInternalModelIds)),
                        "prune data_api_provider_models"
                    );
                } else {
                    assertOk(
                        await supa
                            .from("data_api_provider_models")
                            .delete()
                            .eq("api_provider_id", api_provider_id)
                            .eq("endpoint", endpoint),
                        "prune-all data_api_provider_models"
                    );
                }
            } else if (deletedEntries.length) {
                const deletedKeys = deletedEntries
                    .map(entry => entry.model_key)
                    .filter((key): key is string => !!key);
                if (deletedKeys.length) {
                    assertOk(
                        await supa
                            .from("data_api_provider_models")
                            .delete()
                            .in("id", deletedKeys),
                        "delete data_api_provider_models (targeted)"
                    );
                }
            }
        }

        // ---- pricing_rules for dirty/deleted model_keys ----
        const ruleDeletes = new Set<string>();
        for (const repl of ruleReplacements) ruleDeletes.add(repl.model_key);
        for (const del of deletedEntries) if (del.model_key) ruleDeletes.add(del.model_key);

        const rowsToInsert = ruleReplacements.flatMap(r => r.rows);

        if (isDryRun()) {
            for (const key of ruleDeletes) {
                logWrite("public.data_api_pricing_rules", "DELETE", { model_key: key });
            }
            for (const row of rowsToInsert) {
                logWrite("public.data_api_pricing_rules", "INSERT", row, { onConflict: null });
            }
        } else {
            if (ruleDeletes.size) {
                assertOk(
                    await supa
                        .from("data_api_pricing_rules")
                        .delete()
                        .in("model_key", [...ruleDeletes]),
                    "prune data_api_pricing_rules (targeted)"
                );
            }

            for (const group of chunk(rowsToInsert, 500)) {
                if (!group.length) continue;
                assertOk(
                    await supa
                        .from("data_api_pricing_rules")
                        .insert(group),
                    "insert data_api_pricing_rules"
                );
            }
        }
    }

    if (!hasChanges) return;

    if (!modelId) {
        await pruneRowsByColumn(
            supa,
            "data_api_provider_models",
            "id",
            providerModelIds,
            "data_api_provider_models"
        );
        await pruneRowsByColumn(
            supa,
            "data_api_pricing_rules",
            "model_key",
            pricingRuleKeys,
            "data_api_pricing_rules"
        );
    }
}
