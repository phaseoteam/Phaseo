import { fetchPublicWebApi } from "@/lib/web-api/client";

type PricingRuleRow = {
    model_key: string | null;
    pricing_plan: string | null;
    meter: string | null;
    note: string | null;
    unit: string | null;
    unit_size: number | null;
    price_per_unit: number | string | null;
    effective_from: string | null;
    effective_to: string | null;
};

export type CatalogPricingSummary = {
    apiModelIds: string[];
    lowestInputPrice: number | null;
    lowestOutputPrice: number | null;
    lowestStandardInputPrice: number | null;
    lowestStandardOutputPrice: number | null;
    lowestStandardInputPriceLabel: string | null;
    lowestStandardInputPriceUnit: string | null;
    lowestStandardOutputPriceLabel: string | null;
    lowestStandardOutputPriceUnit: string | null;
    lowestFromPrice: number | null;
    lowestFromPriceUnit: string | null;
    pricingDetailRows: Array<{
        label: string;
        value: string;
    }>;
};

export type CatalogPricingSummaryByModelId = Record<string, CatalogPricingSummary>;

function parseModelKey(modelKey: string): {
    providerId: string;
    apiModelId: string;
    capabilityId: string;
} | null {
    const first = modelKey.indexOf(":");
    const last = modelKey.lastIndexOf(":");
    if (first <= 0 || last <= first) return null;
    return {
        providerId: modelKey.slice(0, first),
        apiModelId: modelKey.slice(first + 1, last),
        capabilityId: modelKey.slice(last + 1),
    };
}

function isRuleExpired(rule: PricingRuleRow, nowMs: number): boolean {
    const toMs = rule.effective_to ? new Date(rule.effective_to).getTime() : null;
    return toMs !== null && Number.isFinite(toMs) && nowMs >= toMs;
}

function isRuleActive(rule: PricingRuleRow, nowMs: number): boolean {
    if (isRuleExpired(rule, nowMs)) return false;
    const fromMs = rule.effective_from ? new Date(rule.effective_from).getTime() : null;
    return fromMs === null || !Number.isFinite(fromMs) || fromMs <= nowMs;
}

function normalizeDisplayUnit(unit: string | null | undefined): string | null {
    const normalized = String(unit ?? "").trim().toLowerCase();
    if (!normalized) return null;
    if (["token", "tokens"].includes(normalized)) return "1M tokens";
    if (["minute", "minutes", "min", "mins", "m"].includes(normalized)) return "second";
    if (["hour", "hours", "hr", "hrs", "h"].includes(normalized)) return "second";
    if (["second", "seconds", "sec", "secs", "s"].includes(normalized)) return "second";
    if (["image", "images"].includes(normalized)) return "image";
    if (["video", "videos"].includes(normalized)) return "video";
    if (["character", "characters", "char", "chars"].includes(normalized)) {
        return "character";
    }
    return normalized;
}

function parseMinutePricingNote(
    note: string | null | undefined,
): { price: number; unit: "minute" } | null {
    const normalized = String(note ?? "").trim();
    if (!normalized) return null;
    const match = normalized.match(/\$([\d.]+)\s*\/\s*minute/i);
    if (!match) return null;
    const price = Number(match[1]);
    if (!Number.isFinite(price) || price < 0) return null;
    return { price, unit: "minute" };
}

function computeDisplayPrice(rule: PricingRuleRow): number | null {
    const minutePricing = parseMinutePricingNote(rule.note);
    if (minutePricing) return minutePricing.price;
    const unitSize = Number(rule.unit_size ?? 0);
    const pricePerUnit = Number(rule.price_per_unit ?? Number.NaN);
    if (!Number.isFinite(pricePerUnit) || !Number.isFinite(unitSize) || unitSize <= 0) {
        return null;
    }
    const meter = String(rule.meter ?? "").trim().toLowerCase();
    const unit = String(rule.unit ?? "").trim().toLowerCase();
    if (meter.includes("token") || ["token", "tokens"].includes(unit)) {
        return pricePerUnit * (1_000_000 / unitSize);
    }
    if (["minute", "minutes", "min", "mins", "m"].includes(unit)) {
        return pricePerUnit / unitSize / 60;
    }
    if (["hour", "hours", "hr", "hrs", "h"].includes(unit)) {
        return pricePerUnit / unitSize / 3600;
    }
    return pricePerUnit / unitSize;
}

function getStandardSideAndLabel(
    meter: string | null | undefined,
): { side: "input" | "output" | null; label: string | null } {
    const normalized = String(meter ?? "").trim().toLowerCase();
    if (["input_text_tokens", "input_tokens"].includes(normalized)) {
        return { side: "input", label: "Text Input" };
    }
    if (["output_text_tokens", "output_tokens"].includes(normalized)) {
        return { side: "output", label: "Text Output" };
    }
    if (["input_audio_tokens", "input_audio"].includes(normalized)) {
        return { side: "input", label: "Audio Input" };
    }
    if (["output_audio_tokens", "output_audio", "output_audio_seconds"].includes(normalized)) {
        return { side: "output", label: "Audio Output" };
    }
    if (["input_image_tokens", "input_image"].includes(normalized)) {
        return { side: "input", label: "Image Input" };
    }
    if (["output_image_tokens", "output_image"].includes(normalized)) {
        return { side: "output", label: "Image Output" };
    }
    if (["input_video_tokens", "input_video"].includes(normalized)) {
        return { side: "input", label: "Video Input" };
    }
    if (["output_video_tokens", "output_video", "output_video_seconds"].includes(normalized)) {
        return { side: "output", label: "Video Output" };
    }
    return { side: null, label: null };
}

function formatPriceAmount(value: number): string {
    if (!Number.isFinite(value) || value < 0) return "$0";
    if (value === 0) return "$0";
    if (value < 0.001) return `$${value.toFixed(4)}`;
    if (value < 0.1) return `$${value.toFixed(3)}`;
    if (value < 1) return `$${value.toFixed(2)}`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDetailValue(price: number, unit: string): string {
    const amount = formatPriceAmount(price);
    if (unit === "1M tokens") return `${amount} / 1M tokens`;
    return `${amount} / ${unit}`;
}

function buildEmptySummary(): CatalogPricingSummary {
    return {
        apiModelIds: [],
        lowestInputPrice: null,
        lowestOutputPrice: null,
        lowestStandardInputPrice: null,
        lowestStandardOutputPrice: null,
        lowestStandardInputPriceLabel: null,
        lowestStandardInputPriceUnit: null,
        lowestStandardOutputPriceLabel: null,
        lowestStandardOutputPriceUnit: null,
        lowestFromPrice: null,
        lowestFromPriceUnit: null,
        pricingDetailRows: [],
    };
}

function buildSummary(apiModelId: string, rows: PricingRuleRow[]): CatalogPricingSummary {
    const summary = buildEmptySummary();
    summary.apiModelIds = [apiModelId];

    const displayRows: Array<{ price: number; unit: string }> = [];
    const displayUnits = new Set<string>();
    const detailRows: Array<{ label: string; value: string }> = [];

    for (const row of rows) {
        const displayPrice = computeDisplayPrice(row);
        const minutePricing = parseMinutePricingNote(row.note);
        const displayUnit = minutePricing
            ? minutePricing.unit
            : normalizeDisplayUnit(row.unit);
        if (displayPrice !== null && displayUnit) {
            displayRows.push({ price: displayPrice, unit: displayUnit });
            displayUnits.add(displayUnit);
        }

        const { side, label } = getStandardSideAndLabel(row.meter);
        if (!side || !label || displayPrice === null || !displayUnit) continue;

        detailRows.push({
            label,
            value: formatDetailValue(displayPrice, displayUnit),
        });

        if (side === "input") {
            if (
                summary.lowestStandardInputPrice === null ||
                displayPrice < summary.lowestStandardInputPrice
            ) {
                summary.lowestInputPrice = displayPrice;
                summary.lowestStandardInputPrice = displayPrice;
                summary.lowestStandardInputPriceLabel = label;
                summary.lowestStandardInputPriceUnit = displayUnit;
            }
        } else if (
            summary.lowestStandardOutputPrice === null ||
            displayPrice < summary.lowestStandardOutputPrice
        ) {
            summary.lowestOutputPrice = displayPrice;
            summary.lowestStandardOutputPrice = displayPrice;
            summary.lowestStandardOutputPriceLabel = label;
            summary.lowestStandardOutputPriceUnit = displayUnit;
        }
    }

    if (displayUnits.size === 1 && displayRows.length > 0) {
        displayRows.sort((a, b) => a.price - b.price);
        summary.lowestFromPrice = displayRows[0]?.price ?? null;
        summary.lowestFromPriceUnit = displayRows[0]?.unit ?? null;
    }

    summary.pricingDetailRows = Array.from(
        new Map(
            detailRows.map((row) => [`${row.label}::${row.value}`, row] as const),
        ).values(),
    ).slice(0, 6);

    return summary;
}

async function fetchPricingRuleRows(): Promise<PricingRuleRow[]> {
	return (await fetchPublicWebApi<{ rules: PricingRuleRow[] }>(
		"/api/_web/models/catalog-pricing-rules",
	)).rules;
}

export async function getCatalogPricingSummariesCached(): Promise<
    CatalogPricingSummaryByModelId
> {
    let rows: PricingRuleRow[];
    try {
        rows = await fetchPricingRuleRows();
    } catch {
        return {};
    }

    const nowMs = Date.now();
    const rowsByApiModelId = new Map<string, PricingRuleRow[]>();
    const activeRowsByApiModelId = new Map<string, PricingRuleRow[]>();

    for (const row of rows) {
        if (isRuleExpired(row, nowMs)) continue;
        const plan = String(row.pricing_plan ?? "standard").trim().toLowerCase();
        if (plan !== "standard") continue;
        const parsed = parseModelKey(String(row.model_key ?? ""));
        if (!parsed?.apiModelId) continue;

        const allRows = rowsByApiModelId.get(parsed.apiModelId) ?? [];
        allRows.push(row);
        rowsByApiModelId.set(parsed.apiModelId, allRows);

        if (isRuleActive(row, nowMs)) {
            const activeRows = activeRowsByApiModelId.get(parsed.apiModelId) ?? [];
            activeRows.push(row);
            activeRowsByApiModelId.set(parsed.apiModelId, activeRows);
        }
    }

    const result: CatalogPricingSummaryByModelId = {};
    for (const [apiModelId, allRows] of rowsByApiModelId) {
        const activeRows = activeRowsByApiModelId.get(apiModelId);
        result[apiModelId] = buildSummary(
            apiModelId,
            activeRows?.length ? activeRows : allRows,
        );
    }

    return result;
}
