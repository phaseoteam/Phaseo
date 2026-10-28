// Purpose: Finalise text-to-speech responses that executors return as a byte stream.
// Why: Speech requests are never ctx.stream, so a kind: "stream" result used to skip the
//      streaming finaliser and the non-stream one alike, and was passed through unpriced,
//      uncharged and unaudited.
// How: Forwards the audio bytes as they arrive (nothing is buffered here) and settles once,
//      when the body ends, errors or the client cancels: price the usage the provider
//      reported (usageFinalizer, else the executor bill), charge once, write the audit.

import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { loadProviderPricing, calculatePricing } from "./pricing";
import { handleSuccessAudit, handleFailureAudit } from "./audit";
import { makeHeaders, createResponse } from "./http";
import { recordUsageAndChargeOnce } from "./charge";
import { shapeUsageForClient, stripUsagePricing } from "../usage";
import { applyByokServiceFee } from "../pricing/byok-fee";
import { applyDataContributionDiscount } from "../pricing/data-contribution-discount";
import { applySuccessfulResponseBillingPolicy, suppressFailedResponseBilling } from "./billing-policy";
import { recordManagedProviderTokensOnce } from "@core/provider-rate-limits";
import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";
import { alertUnexpectedZeroCostMedia } from "./media-zero-cost";

export type SpeechStreamOutcome = "completed" | "cancelled" | "errored";

/** Client headers kept from the provider response; the rest (rate limits, cookies, ids) stay upstream. */
const FORWARDED_HEADERS = ["content-type", "content-disposition"];

function hasUsage(usage: unknown): usage is Record<string, any> {
	return Boolean(usage && typeof usage === "object" && Object.keys(usage as object).length > 0);
}

async function resolveSpeechUsage(result: RequestResult): Promise<Record<string, any> | null> {
	try {
		const finalized = result.usageFinalizer ? await result.usageFinalizer() : null;
		if (hasUsage(finalized?.usage)) return stripUsagePricing(finalized!.usage);
	} catch (error) {
		console.warn("[gateway] speech usage finalizer failed", {
			provider: result.provider,
			error: error instanceof Error ? error.message : String(error),
		});
	}
	return hasUsage(result.bill?.usage) ? stripUsagePricing(result.bill.usage) : null;
}

async function settleSpeechStream(
	ctx: PipelineContext,
	result: RequestResult,
	card: Awaited<ReturnType<typeof loadProviderPricing>>,
	outcome: SpeechStreamOutcome,
	deliveredBytes: number,
): Promise<void> {
	ctx.meta.completedAtMs = Date.now();
	if (typeof ctx.meta.startedAtMs === "number") {
		ctx.meta.end_to_end_ms = Math.max(0, ctx.meta.completedAtMs - ctx.meta.startedAtMs);
	}
	const usage = await resolveSpeechUsage(result);
	const accounting = {
		upstream_status: result.upstream.status,
		response_delivered: deliveredBytes > 0,
		delivered_bytes: deliveredBytes,
		stream_outcome: outcome,
	};
	if (outcome === "errored") {
		// Same policy as the text stream finaliser: an upstream failure part-way through is not
		// charged (the client got partial or corrupt audio); the provider's tokens still count
		// against its rate limit, and the failure is audited.
		const shaped = usage
			? shapeUsageForClient({ ...usage, _provider_id: result.provider }, { endpoint: ctx.endpoint, body: ctx.body, includeInternalHints: true })
			: null;
		await recordManagedProviderTokensOnce({
			ctx,
			providerId: result.provider,
			keySource: result.keySource,
			usage: shaped,
			reservation: result.providerRateLimitReservation,
		});
		suppressFailedResponseBilling({ ctx, result, usage: shaped ?? undefined, reason: "upstream_failure" });
		await handleFailureAudit(ctx, result, 502, "upstream", "upstream_stream_failure",
			"The upstream speech stream failed before successful completion.", { ...accounting, billing_status: "suppressed" },
			null, { gatewayResponse: null, rawUsage: usage, pricingCard: card });
		return;
	}
	if (!usage) {
		await handleFailureAudit(ctx, result, 502, "gateway", "speech_usage_missing",
			"The provider returned audio without usage to bill.", { ...accounting, billing_status: "pending_reconciliation" },
			null, { gatewayResponse: null, rawUsage: null, pricingCard: card });
		return;
	}
	try {
		const raw = { ...usage, _provider_id: result.provider };
		const shaped = shapeUsageForClient(raw, { endpoint: ctx.endpoint, body: ctx.body, includeInternalHints: true });
		const priced = calculatePricing(
			{ ...raw, ...(shaped && typeof shaped === "object" ? shaped : {}) },
			card,
			ctx.body,
			ctx.teamEnrichment?.tier ?? "basic",
			ctx.meta,
		);
		alertUnexpectedZeroCostMedia({ ctx, result, card, totalNanos: priced.totalNanos });
		const isByok = (result.keySource ?? ctx.meta.keySource) === "byok";
		const withByok = await applyByokServiceFee({
			workspaceId: ctx.workspaceId,
			idempotencyKey: ctx.billingRequestId,
			isByok,
			baseCostNanos: priced.totalNanos,
			pricedUsage: priced.pricedUsage,
			currencyHint: priced.currency,
		});
		const successful = applySuccessfulResponseBillingPolicy({
			endpoint: ctx.endpoint,
			pricedUsage: withByok.pricedUsage,
			totalNanos: withByok.totalNanos,
			totalCents: withByok.totalCents,
		});
		const final = {
			...withByok,
			...successful,
			...applyDataContributionDiscount({
				pricedUsage: successful.pricedUsage,
				totalNanos: successful.totalNanos,
				enabled: ctx.teamSettings?.dataContributionEnabled === true,
				isByok,
				discountBps: ctx.teamSettings?.dataContributionDiscountBps,
			}),
		};
		const usageForAudit = shapeUsageForClient(final.pricedUsage, { endpoint: ctx.endpoint, body: ctx.body });
		if (usageForAudit && typeof usageForAudit === "object") delete (usageForAudit as any)._provider_id;
		result.bill.cost_cents = final.totalCents;
		result.bill.currency = final.currency;
		result.bill.usage = usageForAudit;
		const finishReason = outcome === "completed" ? "stop" : outcome === "cancelled" ? "cancel" : "error";
		result.bill.finish_reason = finishReason;

		await recordUsageAndChargeOnce({ ctx, costNanos: final.totalNanos, endpoint: ctx.endpoint, throwOnFailure: true });
		await recordManagedProviderTokensOnce({
			ctx,
			providerId: result.provider,
			keySource: result.keySource,
			usage: usageForAudit,
			reservation: result.providerRateLimitReservation,
		});
		await handleSuccessAudit(
			ctx,
			result,
			false,
			usageForAudit,
			final.totalCents,
			final.totalNanos,
			final.currency,
			finishReason,
			result.upstream.status,
			result.bill.upstream_id ?? null,
			{ object: "audio.speech", ...accounting },
		);
	} catch (error) {
		await handleFailureAudit(ctx, result, 500, "gateway", "speech_finalization_failed",
			"Accounting finalization failed.", {
				...accounting,
				billing_status: "pending_reconciliation",
				cause: error instanceof Error ? error.message : String(error),
			}, null, { gatewayResponse: null, rawUsage: usage, pricingCard: card });
	}
}

/**
 * Wrap a speech byte stream so billing settles exactly once, after the last byte, a read
 * error or a client cancel. A cancelled request is still billed on the provider's reported
 * usage: the provider charges for the whole synthesis once it has started.
 */
export function meterSpeechStream(
	source: ReadableStream<Uint8Array>,
	onSettle: (outcome: SpeechStreamOutcome, deliveredBytes: number) => void,
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	let deliveredBytes = 0;
	let settled = false;
	const settle = (outcome: SpeechStreamOutcome) => {
		if (settled) return;
		settled = true;
		onSettle(outcome, deliveredBytes);
	};
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (error) {
				controller.error(error);
				settle("errored");
				return;
			}
			if (chunk.done) {
				controller.close();
				settle("completed");
				return;
			}
			deliveredBytes += chunk.value?.byteLength ?? 0;
			controller.enqueue(chunk.value);
		},
		async cancel(reason) {
			settle("cancelled");
			await reader.cancel(reason).catch(() => undefined);
		},
	});
}

export async function handleSpeechStreamResponse(
	ctx: PipelineContext,
	result: RequestResult,
	timingHeader?: string,
): Promise<Response> {
	let card: Awaited<ReturnType<typeof loadProviderPricing>>;
	try {
		card = await loadProviderPricing(ctx, result);
	} catch (error) {
		await result.stream?.cancel().catch(() => undefined);
		await handleFailureAudit(ctx, result, 500, "gateway", "speech_finalization_failed",
			"Pricing could not be loaded.", {
				upstream_status: result.upstream.status,
				response_delivered: false,
				billing_status: "pending_reconciliation",
				cause: error instanceof Error ? error.message : String(error),
			}, null, { gatewayResponse: null, rawUsage: result.bill.usage });
		return createResponse({ requestId: ctx.requestId, error: "speech_finalization_failed", message: "Pricing could not be loaded." }, 500, makeHeaders(timingHeader));
	}

	const body = meterSpeechStream(result.stream!, (outcome, deliveredBytes) => {
		let releaseRuntime: () => void = () => { };
		try {
			releaseRuntime = ensureRuntimeForBackground();
		} catch (error) {
			console.error("[gateway] failed to initialize runtime for speech finalization", {
				requestId: ctx.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		dispatchBackground(
			settleSpeechStream(ctx, result, card, outcome, deliveredBytes)
				.catch((error) => {
					console.error("[gateway] speech finalization failed", {
						requestId: ctx.requestId,
						provider: result.provider,
						error: error instanceof Error ? error.message : String(error),
					});
				})
				.finally(releaseRuntime),
		);
	});

	const headers = makeHeaders(timingHeader);
	headers.delete("Content-Type");
	for (const name of FORWARDED_HEADERS) {
		const value = result.upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
	return new Response(body, { status: result.upstream.status, headers });
}
