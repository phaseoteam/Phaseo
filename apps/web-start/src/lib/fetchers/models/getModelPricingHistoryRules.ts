export type ModelPricingHistoryRule = {
	ruleId: string; providerId: string; providerName: string; modelKey: string; pricingPlan: string; meter: string; unit: string; unitSize: number; pricePerUnit: number; pricePer1MUnits: number; currency: string; priority: number; effectiveFrom: string | null; effectiveTo: string | null; note: string | null; match: unknown[]; timeWindows: Array<{ label: string; timezone: "UTC"; days_of_week?: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">; start_time: string; end_time: string; price_per_unit?: string | number | null; priority?: number | null }>;
};

export type ModelPricingHistoryProviderInput = {
	providerId: string; providerName: string; models: Array<{ apiProviderId: string; modelId: string; endpoint: string }>;
};
