export type ProviderOfferScope = "global" | "regional" | "specialized";

const DISPLAY_NAME_OVERRIDES = new Map<string, string>([
	["openai", "OpenAI"],
	["openai-eu", "OpenAI"],
	["anthropic", "Anthropic"],
	["anthropic-us", "Anthropic"],
	["anthropic-aws", "Claude Platform for AWS"],
	["anthropic-aws-us", "Claude Platform for AWS"],
]);

function baseProviderName(providerId: string, providerName: string): string {
	return DISPLAY_NAME_OVERRIDES.get(providerId.trim().toLowerCase())
		?? providerName.trim();
}

function regionalLabel(providerName: string, offerLabel: string): string {
	const providerWords = new Set(
		providerName
			.toLowerCase()
			.replace(/[^a-z0-9\s]+/g, " ")
			.split(/\s+/)
			.filter(Boolean),
	);
	return offerLabel
		.replace(/[^a-z0-9\s]+/gi, " ")
		.split(/\s+/)
		.filter(Boolean)
		.filter((word) => !providerWords.has(word.toLowerCase()))
		.join(" ")
		.trim() || offerLabel.trim();
}

function hasTrailingOfferLabel(providerName: string, offerLabel: string): boolean {
	const normalizedProviderName = providerName.trim().toLowerCase();
	const normalizedOfferLabel = offerLabel.trim().toLowerCase();
	if (!normalizedProviderName || !normalizedOfferLabel) return false;

	return normalizedProviderName.endsWith(`(${normalizedOfferLabel})`)
		|| normalizedProviderName.endsWith(` ${normalizedOfferLabel}`)
		|| normalizedProviderName.endsWith(`-${normalizedOfferLabel}`);
}

export function formatProviderOfferDisplayName(args: {
	providerId: string;
	providerName: string;
	offerLabel?: string | null;
	offerScope?: ProviderOfferScope | null;
}): string {
	const providerName = baseProviderName(args.providerId, args.providerName);
	const offerLabel = String(args.offerLabel ?? "").trim();
	if (!providerName || !offerLabel || args.offerScope === "global") return providerName;
	if (args.offerScope === "regional") {
		const label = regionalLabel(providerName, offerLabel);
		if (providerName.toLowerCase().endsWith(`(${label.toLowerCase()})`)) return providerName;
		return `${providerName} (${label})`;
	}
	if (DISPLAY_NAME_OVERRIDES.has(args.providerId.trim().toLowerCase())) {
		return providerName;
	}
	if (hasTrailingOfferLabel(providerName, offerLabel)) return providerName;
	return `${providerName} ${offerLabel}`;
}
