type Translator = { (key: never, values?: never): string; has(key: never): boolean };

export const PRICING_DISPLAY_LABEL_KEYS: Record<string, string> = {
	"all usage": "Catalogue.modelDetail.sections.allUsage",
	"no cache": "Common.ui.pricingDisplayCopy.noCache",
	"with audio": "Common.ui.pricingDisplayCopy.withAudio",
	"no audio": "Common.ui.pricingDisplayCopy.noAudio",
	"provider-reported cost": "Common.ui.pricingDisplayCopy.providerreportedCost",
	"image generation": "Common.ui.pricingDisplayCopy.imageGeneration",
	"video generation": "Common.ui.pricingDisplayCopy.videoGeneration",
	"image pixels": "Common.ui.pricingDisplayCopy.imagePixels",
	"video pixels": "Common.ui.pricingDisplayCopy.videoPixels",
	"text input": "Common.ui.pricingDisplayCopy.textInput",
	"image inputs": "Catalogue.modelDetail.sections.imageInputs",
	"video inputs": "Catalogue.modelDetail.sections.videoInputs",
	"any resolution": "Catalogue.modelDetail.sections.anyResolution",
	"any size": "Catalogue.modelDetail.sections.anySize",
	"requests": "Catalogue.modelDetail.sections.requests",
	"text": "Catalogue.modelDetail.sections.text",
	"audio": "Catalogue.modelDetail.sections.audio",
	"image": "Catalogue.modelDetail.sections.image",
	"video": "Catalogue.modelDetail.sections.video",
	"embeddings": "Catalogue.modelDetail.sections.embeddings",
	"decisions": "Catalogue.models.detail.actions.decisions",
	"tokens": "Common.ui.metrics.tokens",
	"token": "Catalogue.modelDetail.pricing.unitsSingular.token",
	"multimodal": "Common.ui.modelCreation.modalities.multimodal",
	"quality": "Common.ui.chatComposer.quality",
	"input": "Catalogue.modelDetail.sections.input",
	"output": "Catalogue.modelDetail.sections.output",
	"cache reads": "Catalogue.modelDetail.sections.cacheReads",
	"cache writes": "Catalogue.modelDetail.sections.cacheWrites",
	"other": "Catalogue.modelDetail.sections.other",
	"low": "Common.ui.requestBuilder.low",
	"medium": "Common.ui.requestBuilder.medium",
	"high": "Common.ui.requestBuilder.high",
	"standard": "Catalogue.models.detail.quickstart.tierStandard",
	"default": "Common.ui.chatComposer.default",
	"size": "Catalogue.modelDetail.sections.size",
	"resolution": "Catalogue.modelDetail.sections.resolution",
};

function unitName(raw: string, quantity: number, t: Translator): string {
	const aliases: Record<string, string> = { tokens: "token", pixels: "pixel", images: "image", videos: "video", seconds: "second", sec: "second", minutes: "minute", min: "minute", calls: "request", call: "request", requests: "request", characters: "character", bytes: "byte", pages: "page", credits: "credit", frames: "frame", messages: "message", units: "unit" };
	const unit = aliases[raw.toLowerCase()] ?? raw.toLowerCase();
	if (["frame", "message"].includes(unit)) return t(("Common.ui.pricingDisplayCopy." + unit + (quantity === 1 ? "" : "s")) as never);
	const key = "Catalogue.modelDetail.pricing." + (quantity === 1 ? "unitsSingular." : "units.") + unit;
	if (t.has(key as never)) return t(key as never);
	if (unit === "unit") return t("Catalogue.organisations.unitGeneric" as never);
	return raw;
}

/** Translate known generated presentation copy without modifying catalog IDs or stored labels. */
export function localizedPricingDisplayLabel(value: string | null | undefined, locale: string, t: Translator): string {
	if (!value) return "";
	const raw = value.trim();
	const key = PRICING_DISPLAY_LABEL_KEYS[raw.toLowerCase()];
	if (key) return t(key as never);
	const meterKey = "Catalogue.modelDetail.pricing.meters." + raw.toLowerCase().replace(/[ -]+/g, "_");
	if (t.has(meterKey as never)) return t(meterKey as never);
	const per = raw.match(/^per\s+(?:([\d.,]+)\s*([km])?\s+)?([a-z]+)$/i);
	if (per) {
		const quantity = per[1] ? Number(per[1].replace(/,/g, "")) * (per[2]?.toLowerCase() === "m" ? 1_000_000 : per[2]?.toLowerCase() === "k" ? 1_000 : 1) : 1;
		return t("Common.ui.providerCardCopy.perQuantityUnit" as never, ({ quantity: quantity.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }), unit: unitName(per[3], quantity, t) }) as never);
	}
	const ttl = raw.match(/^(.+?)\s+(?:cache\s+)?ttl$/i);
	if (ttl) {
		const duration = ttl[1].match(/^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/i);
		let label = ttl[1];
		if (duration) {
			const unit = /^m/i.test(duration[2]) ? "minute" : /^h/i.test(duration[2]) ? "hour" : "day";
			label = new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(Number(duration[1]));
		}
		return t("Common.ui.pricingDisplayCopy.durationCacheTTL" as never, ({ duration: label }) as never);
	}
	const tokens = raw.match(/^(Text|Image|Audio|Video|Embeddings|Decisions|Multimodal|Token) Tokens$/i);
	if (tokens) return t("Common.ui.pricingDisplayCopy.modalityTokens" as never, ({ modality: localizedPricingDisplayLabel(tokens[1], locale, t) }) as never);
	const inputs = raw.match(/^(Text|Image|Audio|Video) Inputs$/i);
	if (inputs) return t("Common.ui.pricingDisplayCopy.modalityInputs" as never, ({ modality: localizedPricingDisplayLabel(inputs[1], locale, t) }) as never);
	if (raw.includes(" · ")) return raw.split(" · ").map((part) => localizedPricingDisplayLabel(part, locale, t)).join(" · ");
	if (raw.includes(" - ")) return raw.split(" - ").map((part) => localizedPricingDisplayLabel(part, locale, t)).join(" - ");
	const condition = raw.match(/^(quality|resolution|size)\s*=\s*(.+)$/i);
	if (condition) return `${localizedPricingDisplayLabel(condition[1], locale, t)} = ${localizedPricingDisplayLabel(condition[2], locale, t)}`;
	return value;
}
