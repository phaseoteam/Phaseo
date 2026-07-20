import type { ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";
import type { CatalogPricingSummaryByModelId } from "@/lib/fetchers/models/getCatalogPricingSummaries";

export function withMissingCatalogPricing(
	models: ModelsPageModel[],
	summaries: CatalogPricingSummaryByModelId,
): ModelsPageModel[] {
	return models.map((model) => {
		const candidates = [model.model_id, ...(model.gateway_api_model_ids ?? [])]
			.map((value) => String(value ?? "").trim())
			.filter(Boolean);
		const summary = candidates
			.map((candidate) => summaries[candidate])
			.find(Boolean);
		if (!summary) return model;

		return {
			...model,
			lowest_input_price: model.lowest_input_price ?? summary.lowestInputPrice,
			lowest_output_price: model.lowest_output_price ?? summary.lowestOutputPrice,
			lowest_standard_input_price:
				model.lowest_standard_input_price ?? summary.lowestStandardInputPrice,
			lowest_standard_output_price:
				model.lowest_standard_output_price ?? summary.lowestStandardOutputPrice,
			lowest_standard_input_price_label:
				model.lowest_standard_input_price_label ?? summary.lowestStandardInputPriceLabel,
			lowest_standard_input_price_unit:
				model.lowest_standard_input_price_unit ?? summary.lowestStandardInputPriceUnit,
			lowest_standard_output_price_label:
				model.lowest_standard_output_price_label ?? summary.lowestStandardOutputPriceLabel,
			lowest_standard_output_price_unit:
				model.lowest_standard_output_price_unit ?? summary.lowestStandardOutputPriceUnit,
			lowest_from_price: model.lowest_from_price ?? summary.lowestFromPrice,
			lowest_from_price_unit:
				model.lowest_from_price_unit ?? summary.lowestFromPriceUnit,
			pricing_detail_rows: model.pricing_detail_rows?.length
				? model.pricing_detail_rows
				: summary.pricingDetailRows,
		};
	});
}
