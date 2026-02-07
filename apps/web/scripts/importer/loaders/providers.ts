import { join } from "path";
import { promises as fs } from "fs";
import { DIR_PROVIDERS } from "../paths";
import { listDirs, readJsonWithHash, chunk } from "../util";
import { client, isDryRun, logWrite, assertOk, pruneRowsByColumn } from "../supa";
import { ChangeTracker } from "../state";

const toTextArray = (value?: string[] | string | null): string[] | null => {
    if (Array.isArray(value)) return value.length ? value : null;
    if (typeof value === "string") {
        const parts = value.split(",").map(v => v.trim()).filter(Boolean);
        return parts.length ? parts : null;
    }
    return null;
};

const squashCapabilityParams = (value: unknown): Record<string, unknown> => {
    if (Array.isArray(value)) {
        const out: Record<string, unknown> = {};
        for (const entry of value) {
            if (entry && typeof entry === "object") {
                const obj = entry as Record<string, unknown>;
                const paramId = typeof obj.param_id === "string" ? obj.param_id : null;
                if (!paramId) continue;
                out[paramId] = {
                    provider_min: obj.provider_min ?? null,
                    provider_max: obj.provider_max ?? null,
                    provider_default: obj.provider_default ?? null,
                    notes: obj.notes ?? null,
                };
            } else if (typeof entry === "string" && entry.trim()) {
                out[entry.trim()] = {
                    provider_min: null,
                    provider_max: null,
                    provider_default: null,
                    notes: null,
                };
            }
        }
        return out;
    }
    if (value && typeof value === "object") {
        return value as Record<string, unknown>;
    }
    return {};
};

export async function loadProviders(
    tracker: ChangeTracker,
    opts?: { modelId?: string | null }
) {
    tracker.touchPrefix(DIR_PROVIDERS);
    const modelFilter = opts?.modelId ?? null;
    const dirs = await listDirs(DIR_PROVIDERS);
    const supa = client();
    const providerIds = new Set<string>();
    const providerModelIds = new Set<string>();
    const capabilityKeys = new Set<string>();
    const providerModelsToUpsert: Array<{
        provider_api_model_id: string;
        provider_id: string;
        api_model_id: string;
        provider_model_slug: string | null;
        internal_model_id: string | null;
        is_active_gateway: boolean;
        input_modalities: string[] | null;
        output_modalities: string[] | null;
        quantization_scheme: string | null;
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
    for (const d of dirs) {
        const fp = join(d, "api_provider.json");
        const { data: j, hash } = await readJsonWithHash<any>(fp);
        const change = tracker.track(fp, hash, { api_provider_id: j.api_provider_id });

        const row = {
            api_provider_id: j.api_provider_id,
            api_provider_name: j.api_provider_name,
            description: j.description ?? null,
            link: j.link ?? null,
            country_code: j.country_code ?? null,
            colour: j.colour ?? j.color ?? null,
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
            const modelsChange = tracker.track(modelsPath, modelsHash, {
                api_provider_id: j.api_provider_id,
                kind: "provider_models",
            });
            if (modelsChange.status !== "unchanged") touched = true;

            for (const model of models ?? []) {
                if (!model?.provider_api_model_id || !model?.api_model_id) continue;
                if (modelFilter && model.internal_model_id !== modelFilter) continue;
                const provider_api_model_id = model.provider_api_model_id;
                providerModelIds.add(provider_api_model_id);
                providerModelsToUpsert.push({
                    provider_api_model_id,
                    provider_id: j.api_provider_id,
                    api_model_id: model.api_model_id,
                    provider_model_slug: model.provider_model_slug ?? null,
                    internal_model_id: model.internal_model_id ?? null,
                    is_active_gateway: !!model.is_active_gateway,
                    input_modalities: toTextArray(model.input_modalities),
                    output_modalities: toTextArray(model.output_modalities),
                    quantization_scheme: model.quantization_scheme ?? null,
                    effective_from: model.effective_from ?? null,
                    effective_to: model.effective_to ?? null,
                });

                for (const cap of model.capabilities ?? []) {
                    if (!cap?.capability_id) continue;
                    const capability_id = cap.capability_id;
                    capabilityKeys.add(`${provider_api_model_id}::${capability_id}`);
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

    const deletions = tracker.getDeleted(DIR_PROVIDERS);
    touched = touched || deletions.length > 0;

    if (touched) {
        await pruneRowsByColumn(supa, "data_api_providers", "api_provider_id", providerIds, "data_api_providers");
    }

    if (providerModelsToUpsert.length) {
        for (const group of chunk(providerModelsToUpsert, 500)) {
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

    if (capabilityRowsToUpsert.length) {
        for (const group of chunk(capabilityRowsToUpsert, 500)) {
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

    if (providerModelIds.size && !isDryRun() && !modelFilter) {
        await pruneRowsByColumn(
            supa,
            "data_api_provider_models",
            "provider_api_model_id",
            providerModelIds,
            "data_api_provider_models"
        );
    }

    if (capabilityKeys.size && !isDryRun() && !modelFilter) {
        const keys = Array.from(capabilityKeys);
        for (const group of chunk(keys, 500)) {
            const providerIdsChunk = Array.from(
                new Set(group.map((key) => key.split("::")[0]))
            );
            let data: any[] | null = null;
            let error: any = null;
            try {
                const res = await supa
                    .from("data_api_provider_model_capabilities")
                    .select("provider_api_model_id, capability_id")
                    .in("provider_api_model_id", providerIdsChunk);
                data = res.data as any[] | null;
                error = res.error;
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
}
