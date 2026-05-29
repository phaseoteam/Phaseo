import type {
    PricingRule,
    ProviderModel,
    ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";

const PLAN_ORDER = ["free", "standard", "priority", "flex", "batch"] as const;

function normalizePlan(value: string | null | undefined): string {
    return String(value ?? "").trim().toLowerCase() || "standard";
}

function extractModelIdFromModelKey(modelKey: string): string {
    const firstColon = modelKey.indexOf(":");
    const lastColon = modelKey.lastIndexOf(":");
    if (firstColon < 0 || lastColon <= firstColon) return "";
    return modelKey.slice(firstColon + 1, lastColon).trim();
}

function getSiblingSuffixForPlan(plan: string): string | null {
    if (plan === "priority") return "-fast";
    if (plan === "flex") return "-flex";
    return null;
}

function isSiblingModelIdForPlan(
    modelId: string | null | undefined,
    plan: string,
): boolean {
    const suffix = getSiblingSuffixForPlan(plan);
    if (!suffix) return false;
    return String(modelId ?? "").trim().toLowerCase().endsWith(suffix);
}

function buildProviderModelKey(model: ProviderModel): string {
    return `${model.api_provider_id}:${model.model_id}:${model.endpoint}`;
}

function getDerivedSiblingPlanRules(
    provider: ProviderPricing,
    plan: string,
): PricingRule[] {
    const siblingModelKeys = new Set(
        provider.provider_models
            .filter((model) => isSiblingModelIdForPlan(model.model_id, plan))
            .map((model) => buildProviderModelKey(model)),
    );
    if (!siblingModelKeys.size) return [];

    return provider.pricing_rules.filter((rule) => {
        if (normalizePlan(rule.pricing_plan) !== "standard") return false;
        const ruleModelId = extractModelIdFromModelKey(rule.model_key);
        if (!isSiblingModelIdForPlan(ruleModelId, plan)) return false;
        return siblingModelKeys.has(rule.model_key);
    });
}

export function getProviderPricingRulesForPlan(
    provider: ProviderPricing,
    plan: string,
): PricingRule[] {
    const normalizedPlan = normalizePlan(plan);
    const explicitRules = provider.pricing_rules.filter(
        (rule) => normalizePlan(rule.pricing_plan) === normalizedPlan,
    );
    if (explicitRules.length > 0) return explicitRules;

    if (normalizedPlan === "priority" || normalizedPlan === "flex") {
        return getDerivedSiblingPlanRules(provider, normalizedPlan);
    }

    return [];
}

export function hasPricingForPlan(provider: ProviderPricing, plan: string): boolean {
    return getProviderPricingRulesForPlan(provider, plan).length > 0;
}

export function getProviderAvailablePlans(provider: ProviderPricing): string[] {
    const set = new Set<string>();
    for (const rule of provider.pricing_rules) {
        set.add(normalizePlan(rule.pricing_plan));
    }
    if (!set.has("priority") && getDerivedSiblingPlanRules(provider, "priority").length > 0) {
        set.add("priority");
    }
    if (!set.has("flex") && getDerivedSiblingPlanRules(provider, "flex").length > 0) {
        set.add("flex");
    }
    const ordered = PLAN_ORDER.filter((plan) => set.has(plan));
    const extras = Array.from(set)
        .filter((plan) => !PLAN_ORDER.includes(plan as never))
        .sort();
    return [...ordered, ...extras];
}

export function getProviderModelScopeForPlan(
    provider: ProviderPricing,
    plan: string,
): ProviderPricing["provider_models"] {
    const planRules = getProviderPricingRulesForPlan(provider, plan);
    if (!planRules.length) return provider.provider_models;
    const planModelKeys = new Set(planRules.map((rule) => rule.model_key));
    const matchingProviderModels = provider.provider_models.filter((model) =>
        planModelKeys.has(buildProviderModelKey(model)),
    );
    return matchingProviderModels.length > 0
        ? matchingProviderModels
        : provider.provider_models;
}

export function isProviderVisibleForPlan(provider: ProviderPricing, plan: string): boolean {
    if (!provider.pricing_rules.length) return provider.provider_models.length > 0;
    return hasPricingForPlan(provider, plan);
}
