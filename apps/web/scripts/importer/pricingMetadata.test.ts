import { addPricingSkuMetadata, buildPricingSkuRows } from "./pricingMetadata";

describe("addPricingSkuMetadata", () => {
    it("uses stable default metadata for an untiered rule", () => {
        expect(addPricingSkuMetadata([{
            pricing_plan: "standard",
            meter: "input_text_tokens",
            match: [],
        }])).toEqual([expect.objectContaining({
            sku_id: "input-text-tokens",
            tier_id: "default",
            tier_label: "Standard",
            tier_order: 1,
        })]);
    });

    it("shares tier metadata across meters with the same conditions", () => {
        const lowerTier = [{ path: "input_tokens", op: "lte", value: 200_000 }];
        const upperTier = [{ path: "input_tokens", op: "gt", value: 200_000 }];
        const rows = addPricingSkuMetadata([
            { pricing_plan: "standard", meter: "input_text_tokens", match: lowerTier },
            { pricing_plan: "standard", meter: "output_text_tokens", match: lowerTier },
            { pricing_plan: "standard", meter: "input_text_tokens", match: upperTier },
        ]);

        expect(rows.map(({ sku_id, tier_id, tier_order }) => ({ sku_id, tier_id, tier_order }))).toEqual([
            { sku_id: "input-text-tokens", tier_id: "tier-1", tier_order: 1 },
            { sku_id: "output-text-tokens", tier_id: "tier-1", tier_order: 1 },
            { sku_id: "input-text-tokens", tier_id: "tier-2", tier_order: 2 },
        ]);
    });

    it("builds one parent SKU row per model and meter", () => {
        const rows = addPricingSkuMetadata([
            {
                model_key: "provider:model:text.generate",
                capability_id: "text.generate",
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                match: [],
            },
            {
                model_key: "provider:model:text.generate",
                capability_id: "text.generate",
                pricing_plan: "batch",
                meter: "input_text_tokens",
                unit: "token",
                match: [],
            },
        ]);

        expect(buildPricingSkuRows(rows)).toEqual([
            expect.objectContaining({
                model_key: "provider:model:text.generate",
                sku_id: "input-text-tokens",
                label: "Input Text",
                display_order: 10,
                unit_label: "/M tokens",
                display_multiplier: 1_000_000,
            }),
        ]);
    });
});
