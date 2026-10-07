import type { ModelPricingSource, PricingSourceRow } from "./pricing";
function effective(row: PricingSourceRow, now: number) {
	return (!row.effective_from || Date.parse(String(row.effective_from)) <= now) &&
		(!row.effective_to || Date.parse(String(row.effective_to)) > now);
}

export function withDecisionOperationPricing(models: PricingSourceRow[], source: ModelPricingSource, now = Date.now()): PricingSourceRow[] {
	return models.map(model => {
		const modelId = String(model.model_id);
		const publicRoutes = source.providerRows.filter(route => {
			const provider = route.data_api_providers as PricingSourceRow | null;
			return route.model_id === modelId && route.is_active_gateway === true &&
				route.access_scope === "public" && effective(route, now) &&
				provider?.routing_status === "active" && ["active", "degraded"].includes(String(provider.status));
		});
		const enabled = new Set(publicRoutes.flatMap(route =>
			Array.isArray(route.data_api_provider_model_capabilities) ? route.data_api_provider_model_capabilities
				.filter(cap => ["active", "degraded"].includes(cap.status) && effective(cap, now)).map(cap => String(cap.capability_id)) : []));
		const operationPricing = ["text.generate", "decisions.make"].filter(capability => enabled.has(capability)).map(capability => {
			const rules = source.pricingRows.filter(rule => {
				const key = String(rule.model_key);
				return key.slice(key.indexOf(":") + 1, key.lastIndexOf(":")) === modelId &&
					publicRoutes.some(route => route.provider_api_model_id === rule.provider_model_id &&
						Array.isArray(route.data_api_provider_model_capabilities) &&
						route.data_api_provider_model_capabilities.some(cap => cap.capability_id === capability &&
							["active", "degraded"].includes(cap.status) && effective(cap, now))) &&
					rule.capability_id === capability && rule.sku_status === "active" &&
					rule.pricing_plan === "standard" && rule.unit === "token" && rule.currency === "USD" && effective(rule, now);
			});
			const price = (direction: "input" | "output") => {
				const values = rules.filter(rule => ["input_tokens", "input_text_tokens"].includes(String(rule.meter)) && direction === "input" ||
					["output_tokens", "output_text_tokens"].includes(String(rule.meter)) && direction === "output")
					.map(rule => rule.price_per_unit == null || !Number.isFinite(Number(rule.unit_size)) || Number(rule.unit_size) <= 0
						? NaN : Number(rule.price_per_unit) * 1_000_000 / Number(rule.unit_size))
					.filter(value => Number.isFinite(value) && value >= 0);
				return values.length ? Math.min(...values) : null;
			};
			return { capability, input: price("input"), output: price("output") };
		});
		const text = operationPricing.find(operation => operation.capability === "text.generate");
		return { ...model, operation_pricing: operationPricing,
			lowest_input_price: text?.input ?? null, lowest_output_price: text?.output ?? null,
			lowest_standard_input_price: text?.input ?? null, lowest_standard_output_price: text?.output ?? null,
			lowest_from_price: null, lowest_from_price_unit: null };
	});
}
