import { promises as fs } from "fs";
import { basename, dirname, join, resolve } from "path";
import { DIR_PRICING, DIR_PROVIDERS } from "./importer/paths";
import { listDirs, readJson } from "./importer/util";

type ProviderCapability = {
    capability_id?: string | null;
    status?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
};

type ProviderModelEntry = {
    api_model_id?: string | null;
    provider_api_model_id?: string | null;
    provider_model_slug?: string | null;
    internal_model_id?: string | null;
    is_active_gateway?: boolean | null;
    effective_from?: string | null;
    effective_to?: string | null;
    capabilities?: ProviderCapability[] | null;
};

type PricingJson = {
    key?: string | null;
    api_provider_id?: string | null;
    model_id?: string | null;
    api_model_id?: string | null;
    capability_id?: string | null;
    endpoint?: string | null;
    rules?: unknown[] | null;
};

type MissingPricingRow = {
    api_provider_id: string;
    api_model_id: string;
    capability_id: string;
    provider_api_model_id: string | null;
    provider_model_slug: string | null;
    internal_model_id: string | null;
    is_active_gateway: boolean;
    pricing_key: string;
};

const REPORT_PATH = resolve(
    process.cwd(),
    "scripts/importer/reports/active-provider-pricing-gaps.json",
);

function argValue(flag: string): string | null {
    const prefix = `${flag}=`;
    const raw = process.argv.find((value) => value.startsWith(prefix));
    return raw ? raw.slice(prefix.length).trim() : null;
}

function normalizeStatus(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function isWithinWindow(
    effectiveFrom: string | null | undefined,
    effectiveTo: string | null | undefined,
    nowMs: number,
) {
    const fromMs = effectiveFrom ? Date.parse(effectiveFrom) : Number.NEGATIVE_INFINITY;
    const toMs = effectiveTo ? Date.parse(effectiveTo) : Number.POSITIVE_INFINITY;
    const normalizedFrom = Number.isFinite(fromMs) ? fromMs : Number.NEGATIVE_INFINITY;
    const normalizedTo = Number.isFinite(toMs) ? toMs : Number.POSITIVE_INFINITY;
    return nowMs >= normalizedFrom && nowMs < normalizedTo;
}

async function loadPricingKeys(providerFilter: string | null) {
    const pricingKeys = new Set<string>();
    const providerDirs = await listDirs(DIR_PRICING);

    for (const providerDir of providerDirs) {
        const apiProviderId = basename(providerDir);
        if (providerFilter && apiProviderId !== providerFilter) continue;

        for (const modelDir of await listDirs(providerDir)) {
            for (const capabilityDir of await listDirs(modelDir)) {
                const pricingFile = join(capabilityDir, "pricing.json");
                try {
                    const pricing = await readJson<PricingJson>(pricingFile);
                    const modelId = pricing.api_model_id ?? pricing.model_id;
                    const capabilityId =
                        pricing.capability_id ?? pricing.endpoint ?? basename(capabilityDir);
                    if (!pricing.api_provider_id || !modelId || !capabilityId) continue;

                    pricingKeys.add(
                        `${pricing.api_provider_id}:${modelId}:${capabilityId}`,
                    );
                    if (pricing.key) {
                        pricingKeys.add(String(pricing.key).trim());
                    }
                } catch {
                    // Ignore missing or invalid pricing files here; validation handles file integrity.
                }
            }
        }
    }

    return pricingKeys;
}

async function main() {
    const providerFilter = argValue("--provider");
    const nowMs = Date.now();
    const pricingKeys = await loadPricingKeys(providerFilter);
    const providerDirs = await listDirs(DIR_PROVIDERS);

    const missing: MissingPricingRow[] = [];
    let scannedProviders = 0;
    let scannedProviderModels = 0;
    let scannedActiveCapabilities = 0;

    for (const providerDir of providerDirs) {
        const apiProviderId = basename(providerDir);
        if (providerFilter && apiProviderId !== providerFilter) continue;

        const modelsPath = join(providerDir, "models.json");
        let models: ProviderModelEntry[] = [];
        try {
            models = await readJson<ProviderModelEntry[]>(modelsPath);
        } catch {
            continue;
        }

        scannedProviders += 1;

        for (const model of models) {
            if (!model.api_model_id) continue;
            if (!isWithinWindow(model.effective_from, model.effective_to, nowMs)) continue;
            if (!model.is_active_gateway) continue;

            scannedProviderModels += 1;

            for (const capability of model.capabilities ?? []) {
                const capabilityId = String(capability.capability_id ?? "").trim();
                if (!capabilityId) continue;
                if (!isWithinWindow(capability.effective_from, capability.effective_to, nowMs)) {
                    continue;
                }
                if (normalizeStatus(capability.status) !== "active") continue;

                scannedActiveCapabilities += 1;

                const pricingKey = `${apiProviderId}:${model.api_model_id}:${capabilityId}`;
                if (pricingKeys.has(pricingKey)) continue;

                missing.push({
                    api_provider_id: apiProviderId,
                    api_model_id: model.api_model_id,
                    capability_id: capabilityId,
                    provider_api_model_id: model.provider_api_model_id ?? null,
                    provider_model_slug: model.provider_model_slug ?? null,
                    internal_model_id: model.internal_model_id ?? null,
                    is_active_gateway: Boolean(model.is_active_gateway),
                    pricing_key: pricingKey,
                });
            }
        }
    }

    const byProvider = Array.from(
        missing.reduce((map, row) => {
            map.set(row.api_provider_id, (map.get(row.api_provider_id) ?? 0) + 1);
            return map;
        }, new Map<string, number>()),
    )
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([api_provider_id, missing_count]) => ({ api_provider_id, missing_count }));

    await fs.mkdir(dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(
        REPORT_PATH,
        `${JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                provider_filter: providerFilter,
                scanned_providers: scannedProviders,
                scanned_provider_models: scannedProviderModels,
                scanned_active_capabilities: scannedActiveCapabilities,
                missing_count: missing.length,
                by_provider: byProvider,
                missing,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );

    console.log(
        `[missing-pricing] scanned_providers=${scannedProviders} scanned_provider_models=${scannedProviderModels} scanned_active_capabilities=${scannedActiveCapabilities} missing=${missing.length}`,
    );
    console.log(`[missing-pricing] report=${REPORT_PATH}`);

    if (!missing.length) {
        console.log("[missing-pricing] No missing pricing found for active gateway capabilities.");
        return;
    }

    console.log("[missing-pricing] missing_by_provider");
    for (const row of byProvider) {
        console.log(`- ${row.api_provider_id}: ${row.missing_count}`);
    }
}

main().catch((error) => {
    console.error("[missing-pricing] Failed:", error);
    process.exitCode = 1;
});
