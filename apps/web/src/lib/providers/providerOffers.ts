export type ProviderOfferScope = "global" | "regional" | "specialized";

const PRIORITY_SUFFIXES = ["-lightning", "-turbo", "-fast"] as const;
const REGIONAL_SUFFIXES = ["-eu", "-us"] as const;
const KNOWN_PROVIDER_DISPLAY_NAME_OVERRIDES = new Map<string, string>([
    ["anthropic-aws", "Anthropic on AWS"],
    ["anthropic-aws-us", "Anthropic on AWS"],
]);
const KNOWN_PROVIDER_LOGO_ID_OVERRIDES = new Map<string, string>([
    ["anthropic-aws", "aws"],
    ["anthropic-aws-us", "aws"],
]);
const REGIONAL_SUFFIX_LABELS = new Map<string, string>([
    ["-eu", "EU"],
    ["-us", "US"],
]);

function toTitleCase(value: string): string {
    return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOfferLabel(value?: string | null): string {
    return String(value ?? "").trim();
}

function normalizeRegionalOfferLabel(
    providerName: string,
    offerLabel: string,
): string {
    const normalizedProviderWords = new Set(
        providerName
            .toLowerCase()
            .replace(/[^a-z0-9\s]+/g, " ")
            .split(/\s+/)
            .filter(Boolean),
    );
    const remainingWords = offerLabel
        .split(/\s+/)
        .filter(Boolean)
        .filter((word) => !normalizedProviderWords.has(word.toLowerCase()));

    return remainingWords.join(" ").trim();
}

function inferRegionalOfferLabelFromProviderId(providerId?: string | null): string {
    const normalizedProviderId = String(providerId ?? "").trim().toLowerCase();
    if (!normalizedProviderId) return "";

    for (const [suffix, label] of REGIONAL_SUFFIX_LABELS) {
        if (normalizedProviderId.endsWith(suffix)) {
            return label;
        }
    }

    return "";
}

export function formatProviderOfferDisplayName(args: {
    providerId?: string | null;
    providerName: string;
    offerLabel?: string | null;
    offerScope?: ProviderOfferScope | null;
}): string {
    const providerName = resolveProviderDisplayName({
        providerId: args.providerId,
        providerName: args.providerName,
    });
    const explicitOfferLabel = String(args.offerLabel ?? "").trim();
    const offerScope = args.offerScope ?? null;
    const hasRegionalProviderId = REGIONAL_SUFFIXES.some((suffix) =>
        String(args.providerId ?? "").trim().toLowerCase().endsWith(suffix),
    );
    const inferredRegionalLabel =
        offerScope === "regional" || hasRegionalProviderId
            ? inferRegionalOfferLabelFromProviderId(args.providerId)
            : "";
    const offerLabel = explicitOfferLabel || inferredRegionalLabel;
    const effectiveOfferScope =
        inferredRegionalLabel && hasRegionalProviderId
            ? "regional"
            : offerScope ?? null;

    if (!providerName) return "";
    if (!offerLabel) return providerName;
    if (effectiveOfferScope === "global") return providerName;
    if (effectiveOfferScope === "regional") {
        const regionalLabel = normalizeRegionalOfferLabel(providerName, offerLabel);
        return regionalLabel ? `${providerName} (${regionalLabel})` : providerName;
    }
    if (
        args.providerId &&
        KNOWN_PROVIDER_DISPLAY_NAME_OVERRIDES.has(
            String(args.providerId).trim().toLowerCase(),
        )
    ) {
        return providerName;
    }

    return `${providerName} ${offerLabel}`;
}

export function resolveProviderDisplayName(args: {
    providerId?: string | null;
    providerName: string;
}): string {
    const providerId = String(args.providerId ?? "").trim().toLowerCase();
    if (providerId) {
        const override = KNOWN_PROVIDER_DISPLAY_NAME_OVERRIDES.get(providerId);
        if (override) return override;
    }
    return String(args.providerName ?? "").trim();
}

export function isGlobalProviderOffer(args: {
    offerLabel?: string | null;
    offerScope?: ProviderOfferScope | null;
}): boolean {
    const offerLabel = normalizeOfferLabel(args.offerLabel);
    const offerScope = args.offerScope ?? null;

    if (offerScope === "global") return true;
    if (!offerScope && !offerLabel) return true;
    return false;
}

export function formatProviderOfferVariantLabel(args: {
    offerLabel?: string | null;
    offerScope?: ProviderOfferScope | null;
    providerId?: string | null;
}): string {
    const offerLabel = normalizeOfferLabel(args.offerLabel);
    const offerScope = args.offerScope ?? null;
    const providerId = String(args.providerId ?? "").trim().toLowerCase();

    if (offerLabel) return toTitleCase(offerLabel);
    if (PRIORITY_SUFFIXES.some((suffix) => providerId.endsWith(suffix))) {
        return "Priority";
    }
    if (REGIONAL_SUFFIXES.some((suffix) => providerId.endsWith(suffix))) {
        return "Regional";
    }
    if (isGlobalProviderOffer(args)) return "Standard";
    if (offerScope === "regional") return "Regional";
    if (offerScope === "specialized") return "Specialized";
    return "Standard";
}

export function inferProviderFamilyName(args: {
    providerName: string;
    offerLabel?: string | null;
    offerScope?: ProviderOfferScope | null;
}): string {
    const providerName = String(args.providerName ?? "").trim();
    const offerLabel = normalizeOfferLabel(args.offerLabel);

    if (!providerName) return "";
    if (!offerLabel || isGlobalProviderOffer(args)) return providerName;

    const stripped = providerName
        .replace(new RegExp(`\\s+${escapeRegExp(offerLabel)}$`, "i"), "")
        .trim();

    return stripped || providerName;
}

export function resolveProviderLogoId(args: {
    providerId: string;
    providerFamilyId?: string | null;
}): string {
    const providerId = String(args.providerId ?? "").trim().toLowerCase();
    const providerOverride = KNOWN_PROVIDER_LOGO_ID_OVERRIDES.get(providerId);
    if (providerOverride) return providerOverride;
    const providerFamilyId = String(args.providerFamilyId ?? "").trim();
    if (providerFamilyId && providerFamilyId !== providerId) return providerFamilyId;
    for (const suffix of REGIONAL_SUFFIXES) {
        if (providerId.endsWith(suffix)) {
            return providerId.slice(0, -suffix.length);
        }
    }
    return args.providerId;
}

export function inferProviderFamilyIdFromSiblings(args: {
    providerId: string;
    knownProviderIds: Iterable<string>;
}): string | null {
    const providerId = String(args.providerId ?? "").trim();
    if (!providerId) return null;

    const knownProviderIds = new Set(
        Array.from(args.knownProviderIds, (value) => String(value ?? "").trim()).filter(
            Boolean,
        ),
    );
    if (!knownProviderIds.size) return null;

    for (const suffix of [...PRIORITY_SUFFIXES, ...REGIONAL_SUFFIXES]) {
        if (!providerId.endsWith(suffix)) continue;
        const baseProviderId = providerId.slice(0, -suffix.length).trim();
        if (baseProviderId && knownProviderIds.has(baseProviderId)) {
            return baseProviderId;
        }
    }

    return null;
}
