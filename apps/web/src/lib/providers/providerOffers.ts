export type ProviderOfferScope = "global" | "regional" | "specialized";

const PRIORITY_SUFFIXES = ["-lightning", "-turbo", "-fast"] as const;
const REGIONAL_SUFFIXES = ["-eu", "-us"] as const;

function toTitleCase(value: string): string {
    return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOfferLabel(value?: string | null): string {
    return String(value ?? "").trim();
}

export function formatProviderOfferDisplayName(args: {
    providerName: string;
    offerLabel?: string | null;
    offerScope?: ProviderOfferScope | null;
}): string {
    const providerName = String(args.providerName ?? "").trim();
    const offerLabel = String(args.offerLabel ?? "").trim();
    const offerScope = args.offerScope ?? null;

    if (!providerName) return "";
    if (!offerLabel) return providerName;
    if (offerScope === "global") return providerName;

    return `${providerName} ${offerLabel}`;
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
    const providerFamilyId = String(args.providerFamilyId ?? "").trim();
    if (providerFamilyId) return providerFamilyId;
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
