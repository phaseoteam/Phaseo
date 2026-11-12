// Purpose: Price the model that writes GPT Image SVG output.
// Why: OpenAI bills SVG output twice: GPT Image's reference image at the image rates, and the
// caller-chosen `svg.model` at its own text rates (reported separately as `svg_usage`).
// How: Load the author model's text.generate card before the request (so an unpriced author is
// rejected before OpenAI charges for it) and price `svg_usage` with it afterwards. The result
// rides on usage as `svg_author_pricing`, which after/pricing.ts adds to the request total.

import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";

export type SvgAuthor = {
    /** Phaseo model id, such as openai/gpt-5-nano. */
    model: string;
    /** The id OpenAI expects in svg.model. */
    upstreamModel: string;
    card: PriceCard;
};

export type SvgAuthorPricing = {
    model: string;
    upstream_model: string | null;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    total_nanos: number;
    lines: Record<string, unknown>[];
};

const REQUIRED_METERS = ["input_text_tokens", "output_text_tokens"] as const;

/** Accepts `openai/gpt-5-nano` or `gpt-5-nano`; only OpenAI models can author SVGs. */
export function normalizeSvgAuthorModel(model: string): string | null {
    const trimmed = model.trim().toLowerCase();
    if (!trimmed) return null;
    if (!trimmed.includes("/")) return `openai/${trimmed}`;
    return trimmed.startsWith("openai/") && trimmed.length > "openai/".length ? trimmed : null;
}

function hasStandardTextPrices(card: PriceCard | null): card is PriceCard {
    return Boolean(card?.rules?.length) && REQUIRED_METERS.every((meter) =>
        card!.rules.some((rule) => rule.meter === meter && (rule.pricing_plan ?? "standard") === "standard"),
    );
}

export async function resolveSvgAuthor(
    requestedModel: string,
    load: typeof loadPriceCard = loadPriceCard,
): Promise<SvgAuthor | null> {
    const model = normalizeSvgAuthorModel(requestedModel);
    if (!model) return null;
    const card = await load("openai", model, "text.generate");
    if (!hasStandardTextPrices(card)) return null;
    return { model, upstreamModel: model.slice("openai/".length), card };
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/**
 * Price `svg_usage` at the author's standard text rates. OpenAI counts reasoning inside
 * output_tokens, so reasoning is kept for reporting and never billed twice.
 */
export function priceSvgAuthorUsage(svgUsage: unknown, author: SvgAuthor): SvgAuthorPricing | null {
    if (!svgUsage || typeof svgUsage !== "object") return null;
    const usage = svgUsage as Record<string, unknown>;
    const inputTokens = count(usage.input_tokens);
    const outputTokens = count(usage.output_tokens);
    const priced = computeBillAfterProviderCharge(
        { input_text_tokens: inputTokens, output_text_tokens: outputTokens },
        author.card,
        { endpoint: "text.generate" },
        "standard",
    );
    const pricing = priced.pricing as { total_nanos: number; lines: Record<string, unknown>[] };
    for (const meter of REQUIRED_METERS) {
        const quantity = meter === "input_text_tokens" ? inputTokens : outputTokens;
        if (quantity > 0 && !pricing.lines.some((line) => line.dimension === meter)) {
            throw new Error(`svg_author_pricing_rule_missing:${meter}`);
        }
    }
    return {
        model: author.model,
        upstream_model: typeof usage.model === "string" ? usage.model : null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        reasoning_tokens: count(usage.reasoning_tokens),
        total_nanos: pricing.total_nanos,
        lines: pricing.lines.map((line) => ({ ...line, model: author.model, component: "svg_author" })),
    };
}
