// src/lib/gateway/pricing/types.ts
// Purpose: Pricing rules, billing, and persistence helpers.
// Why: Centralizes all cost calculations.
// How: Defines types consumed by the pricing engine.

export type PriceBand = {
    meter: string;
    unit_size: number;
    price_usd_per_unit: number;
    bill_mode: "all" | "over" | "between";
    bill_from_exclusive: number | null;
    bill_to_inclusive: number | null;
    bill_source: string | null;
    priority: number;
    conditions: unknown[]; // your JSONB array
};

export type PricingDimensionKey =
    | "input_text_tokens"
    | "input_image_tokens"
    | "input_audio_tokens"
    | "input_video_tokens"
    | "output_text_tokens"
    | "output_image_tokens"
    | "output_audio_tokens"
    | "output_video_tokens"
    | "output_image"
    | "cached_write_text_tokens"
    | "cached_write_image_tokens"
    | "cached_write_audio_tokens"
    | "cached_write_video_tokens"
    | "cached_read_text_tokens"
    | "cached_read_image_tokens"
    | "cached_read_video_tokens"
    | "cached_read_audio_tokens"
    | "embedding_tokens"
    | "requests";

export type ConditionOp =
    | "eq" | "ne"
    | "lt" | "lte" | "gt" | "gte"
    | "in" | "not_in"
    | "exists" | "not_exists"
    | "starts_with" | "regex";

export type Condition = {
    path: string;
    op: ConditionOp;
    value?: any;
    or_group?: number;    // OR within the same group
    and_index?: number;   // kept for future ordering needs
};

export type PriceRule = {
    /** DB columns mapped */
    pricing_plan: string;         // standard | batch | flex | priority | ...
    meter: PricingDimensionKey;   // DB: meter
    unit: string;                 // token|image|second|minute|...
    unit_size: number;            // DB: unit_size
    price_per_unit: string;       // keep as string to preserve precision
    currency: string;             // USD
    tiering_mode: "flat" | "cliff" | "marginal" | null; // DB enum
    match: Condition[];           // DB: match[]
    priority: number;             // higher wins

    /** Optional metadata from DB row (id) */
    id?: string;
};

export type PriceCard = {
    provider: string;
    model: string;
    endpoint: string;
    effective_from: string | null;
    effective_to: string | null;
    currency: "USD";
    version: string | null;
    rules: PriceRule[];
};

export type PricingBreakdownLine = {
    dimension: PricingDimensionKey;
    quantity: number;
    billable_units: number;
    unit_size: number;
    unit_price_usd: string;
    line_cost_usd: string;
    bill_mode: "all";       // new schema has no range modes; we bill "all"
    rule_priority: number;
    rule_id?: string;
    line_nanos?: number;
};

export type PricingResult = {
    cost_usd: number;
    cost_usd_str?: string;
    cost_cents: number;
    currency: "USD";
    lines: PricingBreakdownLine[];
};










