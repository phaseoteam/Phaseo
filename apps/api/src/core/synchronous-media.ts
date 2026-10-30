// Purpose: Name the synchronous media operations and guard their billing.
// Why: Each call is billed by the provider when it answers, so the gateway must neither
//      repeat it on another provider nor let it settle at $0 unnoticed.
// How: A shared capability set, used by the execute stage (no fallback after a 2xx) and the
//      after stage (an alert when a paid card prices a successful call at zero).

import type { PriceCard } from "@pipeline/pricing/types";

const SYNCHRONOUS_MEDIA_CAPABILITIES = new Set<string>([
	"image.generate",
	"image.edit",
	"audio.speech",
	"audio.transcription",
	"audio.translations",
	"music.generate",
	"ocr",
	"parse",
]);

// Endpoint and capability aliases that reach the same operations.
const SYNCHRONOUS_MEDIA_ALIASES: Record<string, string> = {
	"images.generations": "image.generate",
	"images.generate": "image.generate",
	"image.generations": "image.generate",
	"images.edits": "image.edit",
	"image.edits": "image.edit",
	"audio/speech": "audio.speech",
	"audio.transcribe": "audio.transcription",
	"audio.translation": "audio.translations",
	"audio.translate": "audio.translations",
};

export function isSynchronousMediaCapability(capability: string | null | undefined): boolean {
	const value = String(capability ?? "");
	return SYNCHRONOUS_MEDIA_CAPABILITIES.has(SYNCHRONOUS_MEDIA_ALIASES[value] ?? value);
}

/** True when the card charges for something: a $0 price for a call on it is unexpected. */
export function priceCardHasPaidRule(card: PriceCard | null | undefined): boolean {
	return Boolean(card?.rules?.some((rule) => Number(rule.price_per_unit) > 0));
}

/**
 * A successful synchronous media call on the gateway key, priced at zero against a card that
 * charges for it. Batch and video finalisation hold such results back; a synchronous response has
 * already been delivered, so the after stage raises an alert instead.
 */
export function isUnexpectedZeroCostMedia(args: {
	capability: string | null | undefined;
	card: PriceCard | null | undefined;
	totalNanos: number;
	upstreamOk: boolean;
	keySource: "gateway" | "byok" | string | null | undefined;
}): boolean {
	return (
		isSynchronousMediaCapability(args.capability) &&
		args.upstreamOk &&
		args.keySource !== "byok" &&
		!(args.totalNanos > 0) &&
		priceCardHasPaidRule(args.card)
	);
}
