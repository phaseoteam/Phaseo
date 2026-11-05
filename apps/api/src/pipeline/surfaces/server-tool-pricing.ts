// Purpose: Price a model that a server tool ran inside another request.
// Why: Chat's image tool runs an image model inside a chat request. Its cost must come from the
// image model's own card, not the chat model's, which would price image tokens wrongly or not at all.
// How: Price the tool's executed result the way the after stage prices a request of its own
// (bill usage merged with payload usage, shaped, then calculatePricing on the executed route's card).
// The parent request carries the result in meta.serverToolPricing, and calculatePricing adds it.

import type { ServerToolPricing } from "@core/types";
import type { PipelineContext } from "@pipeline/before/types";
import { calculatePricing, loadProviderPricing } from "@pipeline/after/pricing";
import { mergeBillAndPayloadUsage, shapeUsageForClient } from "@pipeline/usage";

export async function priceServerToolResult(args: {
	/** The tool's own request context (its own meta, so no parent charges are added). */
	ctx: PipelineContext;
	result: any;
	/** Usage from the encoded response, as the after stage would see it. */
	payloadUsage: unknown;
	body: any;
	component: string;
	model: string;
}): Promise<ServerToolPricing> {
	// Authorized internal tests carry no customer charge, for the tool's model as for the request.
	if (args.ctx.testingMode && !args.ctx.billableInternalTesting) {
		return { component: args.component, model: args.model, provider: String(args.result?.provider ?? ""), total_nanos: 0, lines: [] };
	}
	const card = await loadProviderPricing(args.ctx, args.result);
	if (!card) throw new Error(`server_tool_price_card_missing:${args.result?.provider ?? "unknown"}:${args.model}`);
	const merged = mergeBillAndPayloadUsage(args.result?.bill?.usage, args.payloadUsage);
	const raw = { ...merged, _provider_id: args.result?.provider };
	const shaped = shapeUsageForClient(raw, { endpoint: args.ctx.endpoint, body: args.body, includeInternalHints: true });
	const usage = { ...raw, ...(shaped && typeof shaped === "object" ? shaped : {}) };
	const priced = calculatePricing(usage, card, args.body, args.ctx.teamEnrichment?.tier ?? "basic", args.ctx.meta);
	const lines = Array.isArray(priced.pricedUsage?.pricing?.lines) ? priced.pricedUsage.pricing.lines : [];
	return {
		component: args.component,
		model: args.model,
		provider: String(args.result?.provider ?? ""),
		total_nanos: priced.totalNanos,
		lines: lines.map((line: Record<string, unknown>) => ({
			...line,
			// Keep a line's own model (an SVG author) and name the tool's model otherwise.
			model: typeof line.model === "string" ? line.model : args.model,
			component: typeof line.component === "string" ? `${args.component}.${line.component}` : args.component,
		})),
	};
}
