import type { EffectiveDataPolicy, GatewayProviderSnapshot } from "./types";

type DataPolicyProvider = Pick<GatewayProviderSnapshot,
	"dataPolicyTier" |
	"dataPolicyConfidence" |
	"zeroDataRetention" |
	"dataPolicyVariant" |
	"capabilityParams"
>;

type CapabilityPolicyOverride = Partial<{
    tier: EffectiveDataPolicy["tier"];
    confidence: EffectiveDataPolicy["confidence"];
    zdrEligibility: EffectiveDataPolicy["zdrEligibility"];
    retentionMode: EffectiveDataPolicy["retentionMode"];
    retentionDays: number | null;
    reason: string | null;
    evidenceUrl: string | null;
}>;

const STATEFUL_CAPABILITY_DEFAULTS: Record<string, CapabilityPolicyOverride> = {
    batch: {
        tier: "logs",
        confidence: "confirmed",
        zdrEligibility: "ineligible",
        retentionMode: "until_deleted",
        reason: "Batch processing persists request state and results.",
    },
    "files.upload": {
        tier: "logs",
        confidence: "confirmed",
        zdrEligibility: "ineligible",
        retentionMode: "until_deleted",
        reason: "Uploaded files require persistent provider state.",
    },
    "files.list": {
        tier: "logs",
        confidence: "confirmed",
        zdrEligibility: "ineligible",
        retentionMode: "until_deleted",
        reason: "File storage requires persistent provider state.",
    },
    "files.retrieve": {
        tier: "logs",
        confidence: "confirmed",
        zdrEligibility: "ineligible",
        retentionMode: "until_deleted",
        reason: "File storage requires persistent provider state.",
    },
};

function parseCapabilityOverride(params: Record<string, any> | null | undefined): CapabilityPolicyOverride | null {
    const value = params?.data_policy;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const tier = ["unknown", "private", "logs", "trains"].includes(String(raw.tier))
        ? raw.tier as EffectiveDataPolicy["tier"]
        : undefined;
    const confidence = ["unknown", "confirmed", "maybe"].includes(String(raw.confidence))
        ? raw.confidence as EffectiveDataPolicy["confidence"]
        : undefined;
    const declaredEligibility = ["unknown", "eligible", "ineligible", "conditional"].includes(String(raw.zdrEligibility))
        ? raw.zdrEligibility as EffectiveDataPolicy["zdrEligibility"]
        : undefined;
    const zdrEligibility = declaredEligibility === "ineligible" || raw.zeroDataRetention === false
        ? "ineligible"
        : raw.zeroDataRetention === true ? "eligible" : undefined;
    const retentionMode = ["unknown", "none", "transient", "fixed", "until_deleted"].includes(String(raw.retentionMode))
        ? raw.retentionMode as EffectiveDataPolicy["retentionMode"]
        : undefined;
    const retentionDays = raw.retentionDays === null
        ? null
        : typeof raw.retentionDays === "number" && Number.isFinite(raw.retentionDays) && raw.retentionDays >= 0
          ? raw.retentionDays
          : undefined;
    return {
        tier,
        confidence,
        zdrEligibility,
        retentionMode,
        retentionDays,
        reason: typeof raw.reason === "string" ? raw.reason : undefined,
        evidenceUrl: typeof raw.evidenceUrl === "string" ? raw.evidenceUrl : undefined,
    };
}

function providerZdrEligibility(
	value: GatewayProviderSnapshot["zeroDataRetention"],
): EffectiveDataPolicy["zdrEligibility"] {
	return value === true ? "eligible" : "ineligible";
}

function providerRetentionMode(
	provider: DataPolicyProvider,
): EffectiveDataPolicy["retentionMode"] {
	return provider.zeroDataRetention === true && provider.dataPolicyVariant === "zdr"
		? "none"
		: "unknown";
}

export function resolveEffectiveDataPolicy(args: {
    endpoint: string;
	provider: DataPolicyProvider;
}): EffectiveDataPolicy {
    const provider = args.provider;
    const inherited: EffectiveDataPolicy = {
        tier: provider.dataPolicyTier ?? "unknown",
        confidence: provider.dataPolicyConfidence ?? "unknown",
        zdrEligibility: providerZdrEligibility(provider.zeroDataRetention),
		retentionMode: providerRetentionMode(provider),
        retentionDays: null,
        source: "provider",
        reason: null,
        evidenceUrl: null,
    };
    const explicit = parseCapabilityOverride(provider.capabilityParams);
    const fallback = STATEFUL_CAPABILITY_DEFAULTS[args.endpoint];
    const override = explicit ?? fallback;
    if (!override) return inherited;

    return {
        ...inherited,
        ...override,
        zdrEligibility: override.zdrEligibility ?? fallback?.zdrEligibility ?? inherited.zdrEligibility,
        retentionDays:
            override.retentionDays === undefined ? inherited.retentionDays : override.retentionDays,
        source: explicit ? "capability" : "capability_default",
    };
}
