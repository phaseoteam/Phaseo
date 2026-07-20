type PricingMetadataSource = {
    pricing_plan: string;
    meter: string;
    match: unknown[];
};

export type PricingSkuMetadata = {
    sku_id: string;
    tier_id: string;
    tier_label: string;
    tier_order: number;
};

export type PricingSkuRow = {
    model_key: string;
    capability_id: string;
    sku_id: string;
    label: string;
    kind: string;
    display_order: number;
    unit_label: string;
    display_multiplier: number | null;
    description: null;
    is_billable: true;
    derived_from_sku_id: null;
    derived_quantity: null;
    metadata: {
        calculator_input: {
            key: string;
            label: string;
            type: "number";
        };
    };
};

function deepSortObjectKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(deepSortObjectKeys);
    if (value && typeof value === "object") {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = deepSortObjectKeys((value as Record<string, unknown>)[key]);
        }
        return sorted;
    }
    return value;
}

function matchSignature(match: unknown[]) {
    return JSON.stringify(deepSortObjectKeys(match));
}

function meterSku(meter: string) {
    return meter
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "usage";
}

function meterLabel(meter: string) {
    const labels: Record<string, string> = {
        input_text_tokens: "Input Text",
        cached_read_text_tokens: "Cache Read",
        cached_write_text_tokens: "Cache Write",
        output_text_tokens: "Output Text",
    };
    return labels[meter] ?? meter
        .replace(/_tokens?$/, " Tokens")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function meterDisplayOrder(meter: string) {
    if (meter.startsWith("input_")) return 10;
    if (meter.startsWith("cached_read_")) return 20;
    if (meter.startsWith("cached_write_")) return 30;
    if (meter.startsWith("output_")) return 40;
    return 100;
}

export function addPricingSkuMetadata<T extends PricingMetadataSource>(
    rows: T[]
): Array<T & PricingSkuMetadata> {
    const signaturesByPlan = new Map<string, string[]>();

    for (const row of rows) {
        const signature = matchSignature(row.match);
        const signatures = signaturesByPlan.get(row.pricing_plan) ?? [];
        if (!signatures.includes(signature)) signatures.push(signature);
        signaturesByPlan.set(row.pricing_plan, signatures);
    }

    return rows.map((row) => {
        const signatures = signaturesByPlan.get(row.pricing_plan) ?? [];
        const tierIndex = Math.max(0, signatures.indexOf(matchSignature(row.match)));
        const hasMultipleTiers = signatures.length > 1;
        const tierOrder = hasMultipleTiers ? tierIndex + 1 : 1;

        return {
            ...row,
            sku_id: meterSku(row.meter),
            tier_id: hasMultipleTiers ? `tier-${tierOrder}` : "default",
            tier_label: hasMultipleTiers ? `Tier ${tierOrder}` : "Standard",
            tier_order: tierOrder,
        };
    });
}

export function buildPricingSkuRows<T extends PricingMetadataSource & PricingSkuMetadata & {
    model_key: string;
    capability_id: string;
    unit: string;
}>(rows: T[]): PricingSkuRow[] {
    const byKey = new Map<string, PricingSkuRow>();

    for (const row of rows) {
        const key = `${row.model_key}::${row.sku_id}`;
        if (byKey.has(key)) continue;
        const label = meterLabel(row.meter);
        const isToken = row.unit === "token";
        byKey.set(key, {
            model_key: row.model_key,
            capability_id: row.capability_id,
            sku_id: row.sku_id,
            label,
            kind: row.unit,
            display_order: meterDisplayOrder(row.meter),
            unit_label: isToken ? "/M tokens" : `/${row.unit}`,
            display_multiplier: isToken ? 1_000_000 : null,
            description: null,
            is_billable: true,
            derived_from_sku_id: null,
            derived_quantity: null,
            metadata: {
                calculator_input: {
                    key: row.meter,
                    label,
                    type: "number",
                },
            },
        });
    }

    return Array.from(byKey.values());
}
