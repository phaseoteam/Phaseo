import { join, basename } from "path";
import { DIR_PRICING } from "../paths";
import { listDirs, readJsonWithHash, chunk } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
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
        note: r.note ?? null,
        effective_from: r.effective_from ?? null,
        effective_to: r.effective_to ?? null,
        conditions: deepSortObjectKeys(r.match ?? []),
    };
    return createHash("md5").update(JSON.stringify(payload)).digest("hex");
}

type PricingJSON = {
    key: string;                      // provider:model:capability_id (not required by loader)
    api_provider_id: string;          // NOTE: matches providers table
    provider_slug: string;            // not stored
    model_id: string;
    api_model_id?: string;
    capability_id?: string;
    endpoint?: string;
    capability?: Record<string, unknown>;
    rules?: Array<{
        meter: string;
        unit?: string;
        unit_size?: number;
        price_per_unit?: number;
        price_usd_per_unit?: number;
        currency?: string;
        pricing_plan: string;
        note?: string | null;
        match?: PricingMatch[];             // conditions
        priority?: number;
        effective_from?: string | null;
        effective_to?: string | null;
    }>;
};

type PricingMatch = {
    path: string;
    op: string;
    or_group?: number;
    and_index?: number;
    value: string | number | Array<any>;
}

type CapabilityState = {
    api_provider_id: string;
    capability_id: string;
    ruleReplacements: Array<{ model_key: string; rows: PricingRuleRow[] }>;
};

type PricingRuleRow = {
    model_key: string;
    capability_id: string;
    pricing_plan: string;
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    note: string | null;
    match: unknown[];
    priority: number;
    effective_from: string | null;
    effective_to: string | null;
};

export async function loadPricing(
    tracker: ChangeTracker,
    { modelId, forceFull = false }: { modelId: string | null; forceFull?: boolean }
) {
    const supa = client();
    if (!modelId) tracker.touchPrefix(DIR_PRICING);
    const pricingRuleKeys = new Set<string>();
    let hasChanges = false;
    let scannedFiles = 0;
    let queuedModelKeys = 0;

    const capabilities = new Map<string, CapabilityState>();

    const providerDirs = await listDirs(DIR_PRICING);

    for (const provPath of providerDirs) {
        const api_provider_id = basename(provPath);
        const capabilityDirs = await listDirs(provPath);
        for (const capPath of capabilityDirs) {
            const capabilityFallback = basename(capPath);
            const modelDirs = await listDirs(capPath);

            for (const mPath of modelDirs) {
                const fp = join(mPath, "pricing.json");
                const { data: j, hash } = await readJsonWithHash<PricingJSON>(fp);
                const modelIdFromFile = j.model_id ?? j.api_model_id;
                if (!modelIdFromFile) {
                    throw new Error(`pricing.json missing model_id/api_model_id: ${fp}`);
                }
                if (modelId && modelIdFromFile !== modelId) continue;
                scannedFiles += 1;
                const capability_id = j.capability_id ?? j.endpoint ?? capabilityFallback;
                const computedKey =
                    j.key && j.key.trim()
                        ? j.key
                        : `${j.api_provider_id}:${modelIdFromFile}:${capability_id}`;
                const change = tracker.track(fp, hash, {
                    api_provider_id: j.api_provider_id,
                    capability_id,
                    model_id: modelIdFromFile,
                    model_key: computedKey,
                });

                const capabilityKey = `${api_provider_id}::${capability_id}`;
                const capabilityState: CapabilityState = capabilities.get(capabilityKey) ?? {
                    api_provider_id,
                    capability_id,
                    ruleReplacements: [],
                };

                // Per-file duplicate handling (exact dupes get :occur suffix; near-dupes differ by hash)
                const ruleRows = j.rules || [];
                if (ruleRows.length) pricingRuleKeys.add(computedKey);

                const seenBuckets = new Map<string, number>(); // key: provider||model|capability|meter|prio|digest
                const desiredRules: PricingRuleRow[] = [];

                for (const r of ruleRows) {
                    const prio = r.priority ?? 100;
                    const digest = digestRule(r);
                    const bucket = `${j.api_provider_id}|${modelIdFromFile}|${capability_id}|${r.meter}|${prio}|${digest}`;
                    const occur = (seenBuckets.get(bucket) ?? 0) + 1;
                    seenBuckets.set(bucket, occur);

                    // Map incoming fields to the DB schema
                    const pricing_plan = r.pricing_plan;
                    const unit = r.unit ?? "token";
                    const price_val = (r.price_per_unit ?? r.price_usd_per_unit ?? 0) as number;

                    desiredRules.push({
                        model_key: computedKey,
                        capability_id,
                        pricing_plan,
                        meter: r.meter,
                        unit: unit,
                        unit_size: r.unit_size ?? 1,
                        price_per_unit: toFixed10(price_val),
                        currency: r.currency ?? "USD",
                        note: r.note ?? null,
                        match: r.match ?? [],
                        priority: prio,
                        effective_from: r.effective_from ?? null,
                        effective_to: r.effective_to ?? null,
                    });
                }

                if (modelId || forceFull || change.status !== "unchanged") {
                    capabilityState.ruleReplacements.push({ model_key: computedKey, rows: desiredRules });
                    hasChanges = true;
                    queuedModelKeys += 1;
                }

                capabilities.set(capabilityKey, capabilityState);
            }
        }
    }

    const deleted = modelId ? [] : tracker.getDeleted(DIR_PRICING);
    if (deleted.length) hasChanges = true;
    const deletedByCapability = new Map<string, Array<{ model_key?: string }>>();
    for (const d of deleted) {
        const meta = d.info.meta || {};
        const api_provider_id = meta.api_provider_id;
        const capability_id = meta.capability_id ?? meta.endpoint;
        if (!api_provider_id || !capability_id) continue;
        const capabilityKey = `${api_provider_id}::${capability_id}`;
        const arr = deletedByCapability.get(capabilityKey) ?? [];
        arr.push({ model_key: meta.model_key });
        deletedByCapability.set(capabilityKey, arr);
    }

    for (const capabilityKey of new Set([...capabilities.keys(), ...deletedByCapability.keys()])) {
        const capabilityState = capabilities.get(capabilityKey);
        const ruleReplacements = capabilityState?.ruleReplacements ?? [];
        const deletedEntries = deletedByCapability.get(capabilityKey) ?? [];

        const hasCapabilityChanges =
            ruleReplacements.length > 0 ||
            deletedEntries.length > 0;

        if (!hasCapabilityChanges) continue;

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

    if (!hasChanges) {
        console.log(
            `[pricing-import] No pricing changes detected. scanned_files=${scannedFiles} model_filter=${modelId ?? "none"}`
        );
        return;
    }

    if (!modelId) {
        await pruneRowsByColumn(
            supa,
            "data_api_pricing_rules",
            "model_key",
            pricingRuleKeys,
            "data_api_pricing_rules"
        );
    }

    console.log(
        `[pricing-import] Applied pricing updates. scanned_files=${scannedFiles} queued_model_keys=${queuedModelKeys} keep_model_keys=${pricingRuleKeys.size} full_mode=${forceFull ? "yes" : "no"} model_filter=${modelId ?? "none"}`
    );
}
