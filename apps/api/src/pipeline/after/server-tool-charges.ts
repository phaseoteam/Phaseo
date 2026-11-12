// Purpose: Billing for the model calls and completed rounds of gateway-managed server tools.
// Why: A server tool can run another model (advisor, subagent, fusion, image generation) on
//      Phaseo's keys, and a request can fail after paid rounds already ran. Both were free.
// How: Prices each sub-call on its own route's card, and settles completed rounds on error.

import type { IRChatResponse } from "@core/ir";
import type { TextProtocol } from "@protocols/detect";
import { encodeProtocol } from "@protocols/index";
import type { PipelineContext, ServerToolSubCallCharge } from "../before/types";
import type { RequestResult } from "../execute";
import { mergeBillAndPayloadUsage, shapeUsageForClient } from "../usage";
import { applyByokServiceFee, BYOK_SERVICE_FEE_RATE } from "../pricing/byok-fee";
import { applyDataContributionDiscount } from "../pricing/data-contribution-discount";
import { applyServerToolSubCallCharges, applySuccessfulResponseBillingPolicy } from "./billing-policy";
import { attachToolUsageMetrics, summarizeToolUsage } from "./tool-usage";
import { recordUsageAndChargeOnce } from "./charge";
import { calculatePricing, loadProviderPricing } from "./pricing";
import { isStealthModel, isStealthRequest } from "../stealth";
import { sanitizeStealthMetadata } from "../audit/stealth-identity";
import { stripUsagePricing } from "../usage";

function pricingUsageFor(ctx: PipelineContext, result: RequestResult, protocol: TextProtocol, ir: IRChatResponse | undefined) {
	let payloadUsage: unknown;
	if (ir) {
		try {
			payloadUsage = encodeProtocol(protocol, ir, ctx.requestId)?.usage;
		} catch {
			payloadUsage = undefined;
		}
	}
	const merged = mergeBillAndPayloadUsage(result.bill?.usage, payloadUsage);
	const raw = { ...merged, _provider_id: result.provider };
	const endpoint = protocol === "anthropic.messages"
		? "messages"
		: protocol === "openai.responses"
			? "responses"
			: "chat.completions";
	const shaped = shapeUsageForClient(raw, { endpoint, body: ctx.body, includeInternalHints: true });
	return { ...raw, ...(shaped && typeof shaped === "object" ? shaped : {}) };
}

/**
 * Price a model call a server tool made on the called model's own route. Calls on the
 * workspace's own provider key (BYOK) are paid to the provider directly and carry no charge.
 * Throws when the executed route has no price card, as the main request's pricing does.
 */
export async function priceServerToolSubCall(args: {
	ctx: PipelineContext;
	result: RequestResult;
	kind: ServerToolSubCallCharge["kind"];
	model: string;
}): Promise<ServerToolSubCallCharge> {
	const { ctx, result } = args;
	const ir = result.ir as IRChatResponse | undefined;
	const keySource = (result.keySource ?? ctx.meta.keySource) === "byok" ? "byok" : "gateway";
	const usage = pricingUsageFor(ctx, result, "openai.chat.completions", ir);
	const base: ServerToolSubCallCharge = {
		kind: args.kind,
		model: args.model,
		provider: result.provider,
		keySource,
		totalNanos: 0,
		currency: "USD",
		...(typeof usage.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
		...(typeof usage.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {}),
	};
	if (keySource === "byok") return base;
	const card = await loadProviderPricing(ctx, result);
	const priced = calculatePricing(usage, card, ctx.body, ctx.teamEnrichment?.tier ?? "basic", withoutToolCharges(ctx));
	return { ...base, totalNanos: Math.max(0, Math.round(priced.totalNanos)), currency: priced.currency ?? "USD" };
}

/** One completed upstream round of a server-tool request: the route it ran on and its own usage. */
export type CompletedServerToolRound = {
	result: RequestResult;
	usage: IRChatResponse["usage"] | undefined;
};

/**
 * The request's meta without the image tool's charges (meta.serverToolPricing): calculatePricing
 * adds those to whatever it prices, so a round or an advisor call priced with the request's own
 * meta would include them again. They are added once, to the request's bill.
 */
const withoutToolCharges = (ctx: PipelineContext): PipelineContext["meta"] => ({ ...ctx.meta, serverToolPricing: undefined });

const keySourceOf = (ctx: PipelineContext, result: RequestResult) =>
	(result.keySource ?? ctx.meta.keySource) === "byok" ? "byok" : "gateway";

const pricingLinesOf = (pricedUsage: any): any[] =>
	Array.isArray(pricedUsage?.pricing?.lines) ? pricedUsage.pricing.lines : [];

/** What every round of a multi-round server-tool request costs, priced round by round. */
export type ServerToolRoundsBill = {
	totalNanos: number;
	totalCents: number;
	currency: string;
	/** One set of lines per round (tagged with its round, provider and key source), then tools and sub-calls. */
	pricing: Record<string, any>;
};

/**
 * Prices the rounds of a server-tool request one by one. Rounds can run on different routes and
 * credentials (a model fallback mid-loop), so each is priced on its own card and credential: a
 * BYOK round becomes the BYOK fee, a managed round is charged at its route's price. Tool meters
 * and sub-calls are Phaseo-funded and added once; the data-contribution discount follows the
 * request's final credential, as on a single-round response, and never applies to BYOK fees.
 *
 * A round whose route cannot be priced is handled as a single request with a missing card is:
 * it is not charged, and it is recorded for reconciliation (pricing.billing_status
 * "pending_reconciliation", with its usage and the cause in pricing.unpriced_rounds). The other
 * rounds are still charged; the request is never repriced on another round's card.
 */
export async function priceServerToolRounds(args: {
	ctx: PipelineContext;
	protocol: TextProtocol;
	rounds: readonly CompletedServerToolRound[];
	toolMeters: Record<string, any> | undefined;
}): Promise<ServerToolRoundsBill | null> {
	const { ctx, rounds } = args;
	const lastRound = rounds.at(-1);
	if (!lastRound) return null;
	const tier = ctx.teamEnrichment?.tier ?? "basic";
	const roundMeta = withoutToolCharges(ctx);
	const priceOnRoute = async (result: RequestResult, usage: Record<string, any>) => {
		try {
			return { priced: calculatePricing(usage, await loadProviderPricing(ctx, result), ctx.body, tier, roundMeta), cause: null };
		} catch (error) {
			return { priced: null, cause: error instanceof Error ? error.message : String(error) };
		}
	};
	const unpricedRounds: Array<Record<string, unknown>> = [];
	const waivedRounds: number[] = [];

	let managedNanos = 0;
	let byokNanos = 0;
	const managedLines: any[] = [];
	const byokLines: any[] = [];
	let byokBilling: unknown;
	for (const [index, round] of rounds.entries()) {
		const ir = round.result.ir as IRChatResponse | undefined;
		const usage = pricingUsageFor(ctx, round.result, args.protocol, ir ? { ...ir, usage: round.usage } : undefined);
		const { priced, cause } = await priceOnRoute(round.result, usage);
		const keySource = keySourceOf(ctx, round.result);
		if (!priced) {
			const { _provider_id: _provider, ...rawUsage } = stripUsagePricing(usage) ?? {};
			const causeCode = cause?.startsWith("pricing_card_missing") ? "pricing_card_missing" : "pricing_failed";
			unpricedRounds.push({
				round: index + 1,
				provider: round.result.provider,
				api_model_id: round.result.apiModelId ?? null,
				key_source: keySource,
				raw_usage: rawUsage,
				// The message names the route; a stealth model's route stays in the internal log below.
				cause: isStealthRequest(ctx) ? causeCode : cause,
				cause_code: causeCode,
				billing_status: "pending_reconciliation",
			});
			console.error("[gateway] server tool round pending reconciliation", {
				requestId: ctx.requestId,
				billingRequestId: ctx.billingRequestId,
				round: index + 1,
				provider: round.result.provider,
				cause,
			});
			continue;
		}
		const charged = await applyByokServiceFee({
			workspaceId: ctx.workspaceId,
			idempotencyKey: ctx.byokAllowanceId ?? ctx.billingRequestId,
			isByok: keySource === "byok",
			baseCostNanos: priced.totalNanos,
			pricedUsage: priced.pricedUsage,
			currencyHint: priced.currency ?? "USD",
		});
		// The zero-output waiver, as main applies it to a single response: after the round's BYOK
		// fee, before the round is added. Tool meters and sub-calls are added below, outside it. The
		// round's own tool calls (from its IR) count as output, as they do for a single response.
		const billed = applySuccessfulResponseBillingPolicy({
			endpoint: ctx.endpoint,
			pricedUsage: attachToolUsageMetrics(charged.pricedUsage, summarizeToolUsage({ body: ctx.body, ir })),
			ir,
			totalNanos: charged.totalNanos,
			totalCents: charged.totalCents,
		});
		if (billed.billingSuppressed) waivedRounds.push(index + 1);
		const lines = pricingLinesOf(billed.pricedUsage).map((line) => ({
			...line,
			round: index + 1,
			provider: round.result.provider,
			key_source: keySource,
		}));
		if (keySource === "byok") {
			byokNanos += billed.totalNanos;
			byokLines.push(...lines);
			byokBilling = billed.pricedUsage?.byok_billing ?? byokBilling;
		} else {
			managedNanos += billed.totalNanos;
			managedLines.push(...lines);
		}
	}

	// Tool meters run on Phaseo's keys whatever key the model used: priced once, on the last
	// route's card (a card row of its own wins over the built-in rate), never as a BYOK fee.
	// When that card cannot be loaded, Phaseo's own rates still apply to them.
	if (args.toolMeters) {
		const toolUsage = { ...args.toolMeters, _provider_id: lastRound.result.provider };
		const priced = (await priceOnRoute(lastRound.result, toolUsage)).priced ??
			calculatePricing(toolUsage, toolMetersCard(lastRound.result.provider), ctx.body, tier, roundMeta);
		managedNanos += priced.totalNanos;
		managedLines.push(...pricingLinesOf(priced.pricedUsage));
	}

	// Image-tool models, priced on their own cards (meta.serverToolPricing): at full cost on
	// Phaseo's keys, at the BYOK fee rate on the customer's own key.
	for (const charge of ctx.meta.serverToolPricing ?? []) {
		const providerNanos = Math.max(0, Math.round(Number(charge.total_nanos) || 0));
		managedNanos += charge.key_source === "byok" ? Math.round(providerNanos * BYOK_SERVICE_FEE_RATE) : providerNanos;
		managedLines.push(...(Array.isArray(charge.lines) ? charge.lines : []));
	}

	const managed = applyServerToolSubCallCharges(
		{ pricedUsage: { pricing: { currency: "USD", total_nanos: managedNanos, lines: managedLines } }, totalNanos: managedNanos, totalCents: Math.trunc(managedNanos / 10_000_000) },
		ctx.serverToolSubCallCharges,
	);
	const discounted = applyDataContributionDiscount({
		pricedUsage: managed.pricedUsage,
		totalNanos: managed.totalNanos,
		enabled: ctx.teamSettings?.dataContributionEnabled === true,
		isByok: keySourceOf(ctx, lastRound.result) === "byok",
		discountBps: ctx.teamSettings?.dataContributionDiscountBps,
	});
	const totalNanos = discounted.totalNanos + byokNanos;
	const totalCents = Math.trunc(totalNanos / 10_000_000);
	const pricing = {
		...(discounted.pricedUsage?.pricing ?? {}),
		currency: "USD",
		total_nanos: totalNanos,
		total_cents: totalCents,
		total_usd_str: String(Number((totalNanos / 1_000_000_000).toFixed(9))),
		lines: [...pricingLinesOf(discounted.pricedUsage), ...byokLines],
		server_tool_rounds: rounds.length,
		...(byokBilling ? { byok_billing: byokBilling } : {}),
		...(waivedRounds.length ? { waived_rounds: waivedRounds, waived_rounds_reason: "zero_output_tokens" } : {}),
		...(unpricedRounds.length ? { billing_status: "pending_reconciliation", unpriced_rounds: unpricedRounds } : {}),
	};
	return {
		totalNanos,
		totalCents,
		currency: "USD",
		// These lines reach the client's usage and every log: a stealth model's routes stay hidden.
		pricing: isStealthRequest(ctx)
			? sanitizeStealthMetadata(pricing, String(isStealthModel(ctx.requestedModel) ? ctx.requestedModel : ctx.model).trim()) as Record<string, any>
			: pricing,
	};
}

/**
 * Whether a failed server-tool request's accounting must be written to its failure row: a
 * charge, rounds held for reconciliation, or a bill the wallet did not take.
 */
export function recordsServerToolAccounting(partial: PipelineContext["serverToolPartialCharge"]): boolean {
	return Boolean(partial && (partial.costNanos > 0 || partial.unpricedRounds?.length || partial.expectedNanos));
}

/** The failure row's reconciliation record, when the request has something to reconcile. */
export function serverToolReconciliation(
	partial: NonNullable<PipelineContext["serverToolPartialCharge"]>,
	billingRequestId: string | null | undefined,
	uncollectedReason?: PipelineContext["uncollectedChargeReason"],
): Record<string, unknown> | null {
	if (!partial.unpricedRounds && !partial.expectedNanos) return null;
	return {
		billing_status: "pending_reconciliation",
		billing_request_id: billingRequestId ?? null,
		charged_nanos: partial.costNanos,
		...(partial.expectedNanos ? { expected_nanos: partial.expectedNanos, reason: uncollectedReason ?? "persistence_failed" } : {}),
		...(partial.unpricedRounds ? { unpriced_rounds: partial.unpricedRounds } : {}),
	};
}

/**
 * What a failed or unrecorded request counts against spend limits: its charge, or the charge the
 * wallet did not take (budgets count the expected amount; the wallet status stays pending).
 */
export function failureBudgetNanos(ctx: PipelineContext): number {
	const partial = ctx.serverToolPartialCharge;
	if (partial && partial.costNanos > 0) return partial.costNanos;
	return partial?.expectedNanos ?? ctx.uncollectedChargeNanos ?? 0;
}

/** Whether a failure writer has already taken this request's spend settlement (settleRequestSpend). */
export function failureSpendSettled(ctx: PipelineContext): boolean {
	return (ctx.meta as Record<string, unknown>).__failureSpendSettlement === true;
}

/** True for the first failure writer to ask: it persists the row and settles spend limits from it. */
export function claimFailureSpendSettlement(ctx: PipelineContext): boolean {
	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__failureSpendSettlement === true) return false;
	meta.__failureSpendSettlement = true;
	return true;
}

/** A card with no rows: managed tool meters priced at Phaseo's built-in rates only. */
function toolMetersCard(provider: string) {
	return { provider, model: "", endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD" as const, version: null, rules: [] };
}

/**
 * A multi-round request's charge: its round bill, with the request's usage. Each round was priced on
 * its own card and credential, with the BYOK fee, managed tools, sub-calls and the discount, so the
 * aggregate usage is never priced (the final round's card may not price it). Null without a round bill.
 */
export function serverToolRoundsBilled(
	ctx: PipelineContext,
	usage: unknown,
): { pricedUsage: Record<string, unknown>; totalNanos: number; totalCents: number; currency: string } | null {
	const bill = ctx.serverToolRoundsBill;
	if (!bill) return null;
	const { byok_billing: _aggregateByokBilling, pricing: _aggregatePricing, ...rest } =
		usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
	return { pricedUsage: { ...rest, pricing: bill.pricing }, totalNanos: bill.totalNanos, totalCents: bill.totalCents, currency: bill.currency };
}

/**
 * Charge what a server-tool request already used when it ends in an error after at least one
 * completed upstream round: every completed round's tokens (priced round by round), the server
 * tools' own meters and the model calls they made. Upstream providers, search engines and
 * sub-call models have all charged for this work. Returns the charged amount in nanos.
 */
export async function chargeCompletedServerToolRounds(args: {
	ctx: PipelineContext;
	protocol: TextProtocol;
	rounds: readonly CompletedServerToolRound[];
	/** All completed rounds' usage, with the server-tool counters, for the failure row. */
	usage: IRChatResponse["usage"] | undefined;
	/** The server-tool meters (server_tool_web_search_requests, server_tool_use, ...). */
	toolMeters: Record<string, any> | undefined;
}): Promise<number> {
	const { ctx, rounds } = args;
	const lastRound = rounds.at(-1);
	const bill = await priceServerToolRounds(args);
	if (!lastRound || !bill) return 0;
	const lastIr = lastRound.result.ir as IRChatResponse | undefined;
	const auditBase = pricingUsageFor(
		ctx,
		{ ...lastRound.result, bill: { ...lastRound.result.bill, usage: args.toolMeters ?? {} } } as RequestResult,
		args.protocol,
		lastIr ? { ...lastIr, usage: args.usage } : undefined,
	);
	const pricedUsage = { ...auditBase, pricing: bill.pricing };
	lastRound.result.bill.usage = pricedUsage;
	lastRound.result.bill.cost_cents = bill.totalCents;
	lastRound.result.bill.currency = bill.currency;
	await recordUsageAndChargeOnce({
		ctx,
		costNanos: bill.totalNanos,
		endpoint: ctx.endpoint,
		throwOnFailure: false,
	});
	// Only a charge that reached the wallet is logged and counted against spend limits.
	// Recorded whenever there is something to account for: the charge, rounds held for
	// reconciliation, or a positive bill the wallet did not take (after the charge's retries),
	// which waits for reconciliation like a single request whose charge failed.
	const charged = (ctx.meta as Record<string, unknown>).__usageChargeRecorded === true;
	const unpricedRounds = Array.isArray(bill.pricing.unpriced_rounds) && bill.pricing.unpriced_rounds.length
		? bill.pricing.unpriced_rounds as unknown[]
		: undefined;
	const chargeFailed = !charged && bill.totalNanos > 0;
	if (charged || unpricedRounds || chargeFailed) {
		const auditUsage = shapeUsageForClient(pricedUsage, { endpoint: ctx.endpoint, body: ctx.body });
		ctx.serverToolPartialCharge = {
			costNanos: charged ? bill.totalNanos : 0,
			currency: bill.currency,
			usage: auditUsage && typeof auditUsage === "object" ? auditUsage : {},
			pricingLines: charged || chargeFailed ? bill.pricing.lines : [],
			...(unpricedRounds ? { unpricedRounds } : {}),
			...(chargeFailed ? { expectedNanos: bill.totalNanos } : {}),
		};
	}
	return bill.totalNanos;
}
