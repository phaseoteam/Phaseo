import type { PipelineContext, ServerToolSubCallCharge } from "../before/types";
import type { RequestResult } from "../execute";
import { shapeUsageForClient } from "../usage";
import { deliveredNonTextOutput, irReportsNonTextOutput, usageReportsNonTextOutput, usageReportsProviderOutput, type DeliveredOutput } from "./response-output";

const positiveCount = (value: unknown): boolean =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Whether the request carried input the provider charges for: prompt tokens, cache reads
 * (inside input_tokens) or cache writes. A provider that reports its own cost of zero
 * (usage.cost === 0) has explicitly not charged.
 */
function hasBillableInput(usage: any): boolean {
	if (!usage || typeof usage !== "object") return false;
	if (usage.cost === 0) return false;
	return [
		usage.input_tokens,
		usage.prompt_tokens,
		usage.input_text_tokens,
		usage.cached_read_text_tokens,
		usage.cached_write_text_tokens,
		usage.cached_write_text_tokens_5m,
		usage.cached_write_text_tokens_1h,
	].some(positiveCount);
}

/**
 * Add the charges for model calls a server tool made (priced on each called model's own
 * route) to a request's bill, one pricing line per call.
 */
export function applyServerToolSubCallCharges<T extends { pricedUsage: any; totalNanos: number; totalCents: number }>(
	billed: T,
	charges: readonly ServerToolSubCallCharge[] | null | undefined,
): T {
	const billable = (charges ?? []).filter((charge) => Number.isFinite(charge.totalNanos) && charge.totalNanos > 0);
	if (billable.length === 0) return billed;
	const subCallNanos = billable.reduce((sum, charge) => sum + Math.round(charge.totalNanos), 0);
	const totalNanos = Math.max(0, Math.round(billed.totalNanos)) + subCallNanos;
	const usage = billed.pricedUsage && typeof billed.pricedUsage === "object" ? billed.pricedUsage : {};
	const pricing = usage.pricing && typeof usage.pricing === "object" ? usage.pricing : {};
	const lines = [
		...(Array.isArray(pricing.lines) ? pricing.lines : []),
		...billable.map((charge) => {
			const usd = String(Number((charge.totalNanos / 1_000_000_000).toFixed(9)));
			return {
				dimension: `server_tool_${charge.kind}_model_call`,
				quantity: 1,
				billable_units: 1,
				unit_size: 1,
				unit_price_usd: usd,
				line_cost_usd: usd,
				line_nanos: Math.round(charge.totalNanos),
				sub_call: {
					kind: charge.kind,
					model: charge.model,
					provider: charge.provider,
					...(typeof charge.inputTokens === "number" ? { input_tokens: charge.inputTokens } : {}),
					...(typeof charge.outputTokens === "number" ? { output_tokens: charge.outputTokens } : {}),
				},
			};
		}),
	];
	const totalCents = Math.trunc(totalNanos / 10_000_000);
	return {
		...billed,
		pricedUsage: {
			...usage,
			pricing: {
				currency: "USD",
				...pricing,
				total_nanos: totalNanos,
				total_cents: totalCents,
				total_usd_str: String(Number((totalNanos / 1_000_000_000).toFixed(9))),
				lines,
				server_tool_sub_call_nanos: subCallNanos,
			},
		},
		totalNanos,
		totalCents,
	};
}

export function applySuccessfulResponseBillingPolicy(args: {
	endpoint: string;
	pricedUsage: any;
	totalNanos: number;
	totalCents: number;
	/** Model calls server tools made; billed even when the main model's own usage is waived. */
	subCallCharges?: readonly ServerToolSubCallCharge[] | null;
	/** The response (IR), when there is one: its tool calls and media or reasoning parts are output. */
	ir?: unknown;
	/** What a stream delivered (it has no IR): the same output, recorded as it was emitted. */
	delivered?: DeliveredOutput | null;
}): { pricedUsage: any; totalNanos: number; totalCents: number; billingSuppressed: boolean } {
	return applyServerToolSubCallCharges(zeroOutputBillingPolicy(args), args.subCallCharges);
}

function zeroOutputBillingPolicy(args: {
	endpoint: string;
	pricedUsage: any;
	totalNanos: number;
	totalCents: number;
	ir?: unknown;
	delivered?: DeliveredOutput | null;
}): { pricedUsage: any; totalNanos: number; totalCents: number; billingSuppressed: boolean } {
	const isTextGeneration =
		args.endpoint === "chat.completions" ||
		args.endpoint === "responses" ||
		args.endpoint === "messages";
	const outputTokens = Number(
		args.pricedUsage?.output_tokens ??
		args.pricedUsage?.completion_tokens ??
		args.pricedUsage?.output_text_tokens ??
		NaN,
	);
	// Any other output (response-output.ts, shared with each server-tool round and the
	// empty-response check) means the response was not empty. A stream decides from what its client
	// received and the provider's own usage, not the gateway's counts of provider events: those
	// include output after a cancel or dropped by the client's encoder.
	const hasOtherOutput = args.delivered
		? usageReportsProviderOutput(args.pricedUsage) || deliveredNonTextOutput(args.delivered)
		: usageReportsNonTextOutput(args.pricedUsage) || irReportsNonTextOutput(args.ir);
	// An empty answer is waived only when the provider charged nothing for it either: no
	// prompt or cache tokens (or a reported cost of zero). Input is billed upstream even when
	// the model produces no output.
	const suppress = isTextGeneration && outputTokens === 0 && !hasOtherOutput &&
		!hasBillableInput(args.pricedUsage);
	if (!suppress) {
		return {
			pricedUsage: args.pricedUsage,
			totalNanos: args.totalNanos,
			totalCents: args.totalCents,
			billingSuppressed: false,
		};
	}
	const pricing = args.pricedUsage?.pricing;
	const byokBilling = args.pricedUsage?.byok_billing;
	return {
		pricedUsage: pricing && typeof pricing === "object"
			? {
				...args.pricedUsage,
				...(byokBilling && typeof byokBilling === "object"
					? {
						byok_billing: {
							...byokBilling,
							fee_applied: false,
							fee_nanos: 0,
							charged_nanos: 0,
						},
					}
					: {}),
				pricing: {
					...pricing,
					subtotal_nanos: Math.max(0, Math.round(args.totalNanos)),
					total_nanos: 0,
					total_cents: 0,
					total_usd_str: "0.000000000",
					lines: [],
					billing_suppressed: true,
					billing_suppression_reason: "zero_output_tokens",
				},
			}
			: args.pricedUsage,
		totalNanos: 0,
		totalCents: 0,
		billingSuppressed: true,
	};
}

export function suppressFailedResponseBilling(args: {
	ctx: PipelineContext;
	result: RequestResult;
	usage?: unknown;
	reason: "upstream_failure" | "incomplete_stream" | "empty_response";
}): void {
	const rawUsage = args.usage ?? {
		...((args.result.bill?.usage && typeof args.result.bill.usage === "object") ? args.result.bill.usage : {}),
		...((args.result.ir?.usage && typeof args.result.ir.usage === "object") ? args.result.ir.usage : {}),
	};
	const shaped = shapeUsageForClient(rawUsage, {
		endpoint: args.ctx.endpoint,
		body: args.ctx.body,
		includeInternalHints: true,
	});
	const usageForAudit = shaped && typeof shaped === "object" ? { ...shaped } : {};
	delete (usageForAudit as any)._provider_id;
	(usageForAudit as any).pricing = {
		total_nanos: 0,
		total_cents: 0,
		total_usd_str: "0.000000000",
		currency: args.result.bill.currency ?? "USD",
		lines: [],
		billing_suppressed: true,
		billing_suppression_reason: args.reason,
	};
	args.result.bill.cost_cents = 0;
	args.result.bill.currency = args.result.bill.currency ?? "USD";
	args.result.bill.usage = usageForAudit;
}

const lineNanos = (line: Record<string, unknown>): number => {
	const nanos = Number(line.line_nanos ?? 0);
	return Number.isFinite(nanos) && nanos > 0 ? nanos : 0;
};

/** The sum of a bill's pricing lines (line_nanos), 0 when there are none. */
export function pricingLinesTotalNanos(lines: unknown): number {
	if (!Array.isArray(lines)) return 0;
	return lines.reduce((sum: number, line) => sum + (line && typeof line === "object" ? lineNanos(line as Record<string, unknown>) : 0), 0);
}

/**
 * The pricing lines for a failed request that was still charged (a stream the client left, a
 * checkpoint charge kept after a finalization error): the lines of the bill it was priced from,
 * lowered in proportion when less was charged, so they add up to the charge. Their SKU meters
 * become the request's v2_request_pricing_lines, which per-SKU totals such as promotion budgets
 * (enforce_pricing_promotion_budgets) sum. Empty when nothing was charged or nothing was priced.
 */
export function pricingLinesForCharge(lines: unknown, chargedNanos: number): Record<string, unknown>[] {
	if (!Array.isArray(lines) || !Number.isFinite(chargedNanos) || chargedNanos <= 0) return [];
	const priced = lines.filter((line): line is Record<string, unknown> => !!line && typeof line === "object");
	const total = pricingLinesTotalNanos(priced);
	if (total <= 0) return [];
	if (total <= chargedNanos) return priced.map((line) => ({ ...line }));
	const charged = Math.round(chargedNanos);
	const factor = charged / total;
	const scaled = priced.map((line) => ({ ...line, line_nanos: Math.floor(lineNanos(line) * factor) }));
	// Rounding down leaves a few nanos: they go on the largest line, so the lines sum to the charge.
	const remainder = charged - scaled.reduce((sum, line) => sum + line.line_nanos, 0);
	if (remainder > 0) {
		let largest = 0;
		for (let i = 1; i < scaled.length; i += 1) if (scaled[i].line_nanos > scaled[largest].line_nanos) largest = i;
		scaled[largest].line_nanos += remainder;
	}
	return scaled.map((line, index) => ({
		...line,
		line_cost_usd: (line.line_nanos / 1_000_000_000).toFixed(9),
		priced_line_nanos: lineNanos(priced[index]),
	}));
}
