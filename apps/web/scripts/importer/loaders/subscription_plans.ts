import { join } from "path";
import { createHash } from "crypto";
import { DIR_SUBSCRIPTION_PLANS } from "../paths";
import { listDirs, readJsonWithHash } from "../util";
import {
    client,
    isDryRun,
    logWrite,
    assertOk,
    pruneRowsByColumn,
    touchModelTimestamps,
} from "../supa";
import { ChangeTracker } from "../state";

const normalizeModelIdForMatch = (value: string): string => {
    let normalized = value.trim().toLowerCase();
    if (!normalized) return normalized;
    normalized = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    normalized = normalized.replace(/qwen3(?=[^0-9]|$)/g, "qwen-3");
    normalized = normalized.replace(/qwen2\.5(?=[^0-9]|$)/g, "qwen-2-5");
    normalized = normalized.replace(/(\d)\.(\d)/g, "$1-$2");
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

const loadKnownModelIds = async (
    supa: ReturnType<typeof client>
): Promise<{
    modelIds: Set<string>;
    normalizedModelIdToModelId: Map<string, string>;
}> => {
    const modelIds = new Set<string>();
    const normalizedModelIdCandidates = new Map<string, string[]>();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const res = await supa
            .from("data_models")
            .select("model_id")
            .range(offset, offset + pageSize - 1);
        const rows = assertOk(res, "select data_models (model_id)") as Array<{
            model_id?: string | null;
        }>;
        for (const row of rows) {
            if (typeof row?.model_id !== "string" || !row.model_id) continue;
            modelIds.add(row.model_id);
            const normalized = normalizeModelIdForMatch(row.model_id);
            if (!normalized) continue;
            const list = normalizedModelIdCandidates.get(normalized) ?? [];
            if (!list.includes(row.model_id)) list.push(row.model_id);
            normalizedModelIdCandidates.set(normalized, list);
        }
        if (rows.length < pageSize) break;
    }

    const normalizedModelIdToModelId = new Map<string, string>();
    for (const [normalized, modelIdCandidates] of normalizedModelIdCandidates.entries()) {
        const preferred = choosePreferredModelId(modelIdCandidates);
        if (preferred) normalizedModelIdToModelId.set(normalized, preferred);
    }
    return { modelIds, normalizedModelIdToModelId };
};

function resolveTouchedModelIds(
    rawModelIds: Iterable<string | null | undefined>,
    lookups: {
        knownModelIds: Set<string>;
        normalizedModelIdToModelId: Map<string, string>;
    }
): string[] {
    const resolved = new Set<string>();

    for (const value of rawModelIds) {
        const normalizedValue = typeof value === "string" ? value.trim() : "";
        if (!normalizedValue) continue;

        const modelId =
            (lookups.knownModelIds.has(normalizedValue) ? normalizedValue : "") ||
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

function generateDeterministicUUID(input: string): string {
    const hash = createHash('md5').update(input).digest('hex');
    return hash.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

type RawPlanModel = {
    model_id: unknown;
    model_info?: unknown;
    rate_limit?: unknown;
    other_info?: unknown;
};

function toNonEmptyScalarString(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return null;
}

function collapsePlanModelVariants(modelId: string, variants: RawPlanModel[]): RawPlanModel {
    if (variants.length === 1) return variants[0];
    const modelInfoValues = [...new Set(
        variants
            .map((variant) => toNonEmptyScalarString(variant.model_info))
            .filter((value): value is string => value != null)
    )];
    const rateLimitValues = [...new Set(
        variants
            .map((variant) => toNonEmptyScalarString(variant.rate_limit))
            .filter((value): value is string => value != null)
    )];

    return {
        model_id: modelId,
        model_info: modelInfoValues.length > 0 ? modelInfoValues.join(" | ") : null,
        rate_limit: rateLimitValues.length > 0 ? rateLimitValues.join(" | ") : null,
        other_info: {
            variants: variants.map((variant) => ({
                model_info: variant.model_info ?? null,
                rate_limit: variant.rate_limit ?? null,
                other_info: variant.other_info ?? null,
            })),
        },
    };
}

export async function loadSubscriptionPlans(tracker: ChangeTracker) {
    const supa = client();
    const { modelIds: knownModelIds, normalizedModelIdToModelId } = await loadKnownModelIds(supa);
    const remappedModelRefs: Array<{ source: string; from: string; to: string }> = [];
    const missingModelRefs: Array<{ source: string; model_id: string }> = [];
    const touchedModelIds = new Set<string>();
    tracker.touchPrefix(DIR_SUBSCRIPTION_PLANS);
    const planUuids = new Set<string>();
    const dirs = await listDirs(DIR_SUBSCRIPTION_PLANS);
    let touched = false;
    for (const d of dirs) {
        const fp = join(d, "plan.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = tracker.track(fp, hash, {
            plan_id: j.plan_id,
            organisation_id: j.organisation_id,
            model_ids: Array.isArray(j.models)
                ? j.models
                      .map((model: RawPlanModel) =>
                          typeof model?.model_id === "string" ? model.model_id.trim() : ""
                      )
                      .filter(Boolean)
                : [],
        });

        if (!j.plan_id || !j.name || !j.organisation_id) {
            console.error(`Skipping ${d}: missing required fields plan_id, name, or organisation_id`);
            continue;
        }

        // Assume pricing_options is an array of { frequency, usd_price, currency? }
        if (!Array.isArray(j.pricing_options) || j.pricing_options.length === 0) {
            console.error(`Skipping ${d}: pricing_options is not a valid array or empty`);
            continue;
        }

        for (const option of j.pricing_options) {
            if (!option.frequency || typeof option.usd_price !== 'number') {
                console.error(`Skipping option in ${d}: invalid frequency or usd_price`);
                continue;
            }

            const shouldWrite = change.status !== "unchanged";

            // Insert/update the subscription plan
            const planRow = {
                plan_uuid: generateDeterministicUUID(`${j.plan_id}-${option.frequency}-${j.organisation_id}`),
                plan_id: j.plan_id,
                name: j.name,
                organisation_id: j.organisation_id,
                description: j.description ?? null,
                frequency: option.frequency,
                price: option.usd_price,
                currency: option.currency ?? "USD",
                link: j.link ?? null,
                other_info: j.other_info ?? {},
            };

            planUuids.add(planRow.plan_uuid);
            if (!shouldWrite) continue;
            touched = true;

            if (isDryRun()) {
                logWrite("public.data_subscription_plans", "UPSERT", planRow, { onConflict: "plan_uuid" });
            } else {
                const res = await supa
                    .from("data_subscription_plans")
                    .upsert(planRow, { onConflict: "plan_uuid" });
                assertOk(res, "upsert data_subscription_plans");
            }

            // Insert/update the plan models
            if (j.models && Array.isArray(j.models)) {
                const groupedModels = new Map<string, RawPlanModel[]>();
                for (const rawModel of j.models as RawPlanModel[]) {
                    const modelId = typeof rawModel?.model_id === "string" ? rawModel.model_id.trim() : "";
                    if (!modelId) {
                        console.error(`Skipping model in ${d}: missing model_id`);
                        continue;
                    }
                    const variants = groupedModels.get(modelId) ?? [];
                    variants.push(rawModel);
                    groupedModels.set(modelId, variants);
                }

                const uniqueModels = Array.from(groupedModels.entries()).map(([modelId, variants]) =>
                    collapsePlanModelVariants(modelId, variants)
                );
                for (const model of uniqueModels) {
                    const rawModelId = String(model.model_id).trim();
                    const resolvedModelId =
                        (knownModelIds.has(rawModelId) ? rawModelId : "") ||
                        normalizedModelIdToModelId.get(normalizeModelIdForMatch(rawModelId)) ||
                        "";
                    if (!resolvedModelId) {
                        missingModelRefs.push({
                            source: fp,
                            model_id: rawModelId,
                        });
                        continue;
                    }
                    if (resolvedModelId !== rawModelId) {
                        remappedModelRefs.push({
                            source: fp,
                            from: rawModelId,
                            to: resolvedModelId,
                        });
                    }
                    const modelRow = {
                        plan_uuid: planRow.plan_uuid,
                        model_id: resolvedModelId,
                        model_info: model.model_info ?? {},
                        rate_limit: model.rate_limit ?? {},
                        other_info: model.other_info ?? {},
                    };

                    if (!shouldWrite) continue;
                    touchedModelIds.add(resolvedModelId);

                    if (isDryRun()) {
                        logWrite("public.data_subscription_plan_models", "UPSERT", modelRow, { onConflict: "plan_uuid,model_id" });
                    } else {
                        const res = await supa
                            .from("data_subscription_plan_models")
                            .upsert(modelRow, { onConflict: "plan_uuid,model_id" });
                        assertOk(res, "upsert data_subscription_plan_models");
                    }
                }
            }

            // Insert/update the plan features (details)
            if (j.features && Array.isArray(j.features)) {
                for (const detail of j.features) {
                    if (!detail.feature_name) {
                        console.error(`Skipping feature in ${d}: missing feature_name`);
                        continue;
                    }
                    const featureRow = {
                        plan_uuid: planRow.plan_uuid,
                        feature_name: detail.feature_name,
                        feature_value: detail.feature_value ?? null,
                        feature_description: detail.feature_description ?? null,
                        other_info: detail.other_info ?? {},
                    };

                    if (!shouldWrite) continue;

                    if (isDryRun()) {
                        logWrite("public.data_subscription_plan_features", "UPSERT", featureRow, { onConflict: "plan_uuid,feature_name" });
                    } else {
                        const res = await supa
                            .from("data_subscription_plan_features")
                            .upsert(featureRow, { onConflict: "plan_uuid,feature_name" });
                        assertOk(res, "upsert data_subscription_plan_features");
                    }
                }
            }
        }
    }

    if (remappedModelRefs.length > 0) {
        const details = remappedModelRefs
            .slice(0, 25)
            .map((row) => `- from=${row.from} to=${row.to} source=${row.source}`)
            .join("\n");
        const suffix =
            remappedModelRefs.length > 25
                ? `\n...and ${remappedModelRefs.length - 25} more remapped model references.`
                : "";
        console.warn(
            `[subscription-plans-import] Remapped ${remappedModelRefs.length} model reference(s) to current data_models IDs.\n${details}${suffix}`
        );
    }
    if (missingModelRefs.length > 0) {
        const details = missingModelRefs
            .slice(0, 25)
            .map((row) => `- model_id=${row.model_id} source=${row.source}`)
            .join("\n");
        const suffix =
            missingModelRefs.length > 25
                ? `\n...and ${missingModelRefs.length - 25} more missing model references.`
                : "";
        console.warn(
            `[subscription-plans-import] Skipped ${missingModelRefs.length} model reference(s) because model_id was not found in data_models.\n${details}${suffix}`
        );
    }

    const deletions = tracker.getDeleted(DIR_SUBSCRIPTION_PLANS);
    for (const deletion of deletions) {
        const rawModelIds = Array.isArray(deletion.info.meta?.model_ids)
            ? deletion.info.meta.model_ids
            : [];
        for (const touchedModelId of resolveTouchedModelIds(rawModelIds, {
            knownModelIds,
            normalizedModelIdToModelId,
        })) {
            touchedModelIds.add(touchedModelId);
        }
    }
    touched = touched || deletions.length > 0;
    if (!touched) return;

    await pruneRowsByColumn(
        supa,
        "data_subscription_plan_features",
        "plan_uuid",
        planUuids,
        "data_subscription_plan_features"
    );
    await pruneRowsByColumn(
        supa,
        "data_subscription_plan_models",
        "plan_uuid",
        planUuids,
        "data_subscription_plan_models"
    );
    await pruneRowsByColumn(
        supa,
        "data_subscription_plans",
        "plan_uuid",
        planUuids,
        "data_subscription_plans"
    );

    await touchModelTimestamps(supa, touchedModelIds);
}
