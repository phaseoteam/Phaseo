import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/swr/providerCatalogPreviews";

function pricePerMillion(
	preview: AuthenticatedProviderCatalogPreview,
	direction: "input" | "output",
): number | null {
	const meter = (preview.pricing ?? []).find((entry) => {
		const normalized = `${entry.meterKey} ${entry.direction ?? ""} ${entry.displayLabel}`.toLowerCase();
		return direction === "input"
			? normalized.includes("input") || normalized.includes("prompt")
			: normalized.includes("output") || normalized.includes("completion");
	});
	if (!meter || !Number.isFinite(meter.priceNanos) || !Number.isFinite(meter.unitQuantity) || meter.unitQuantity <= 0) {
		return null;
	}
	const price = (meter.priceNanos / 1_000_000_000) * (1_000_000 / meter.unitQuantity);
	return Number.isFinite(price) ? price : null;
}

export function providerCatalogPreviewToGatewayModel(
	preview: AuthenticatedProviderCatalogPreview,
): GatewaySupportedModel {
	const requestModelId = `${preview.provider_slug}:${preview.model_id}`;
	const capabilities = preview.endpoints ?? [];

	return {
		modelId: requestModelId,
		internalModelId: preview.model_id,
		selectorModelId: requestModelId,
		providerId: preview.provider_slug,
		capabilities,
		inputModalities: preview.input_modalities ?? [],
		outputModalities: preview.output_modalities ?? [],
		effectiveFrom: preview.available_from ?? null,
		effectiveTo: preview.shutdown_at ?? preview.deprecated_at ?? null,
		providerName: preview.provider_name,
		providerFamilyId: null,
		providerOfferLabel: "Internal testing",
		providerOfferScope: "specialized",
		providerPromptTrainingPolicy: null,
		modelName: preview.model_name,
		modelStatus: "unreleased",
		organisationId: preview.provider_slug,
		organisationName: preview.provider_name,
		previousModelId: null,
		releaseDate: preview.release_date ?? preview.available_from ?? null,
		announcementDate: preview.announcement_date ?? preview.created_at ?? null,
		inputPricePerMillion: pricePerMillion(preview, "input"),
		outputPricePerMillion: pricePerMillion(preview, "output"),
		isAvailable: true,
	};
}

export function providerCatalogPreviewsToGatewayModels(
	previews: AuthenticatedProviderCatalogPreview[],
): GatewaySupportedModel[] {
	const seen = new Set<string>();
	return previews.flatMap((preview) => {
		if (!preview.can_test) return [];
		const model = providerCatalogPreviewToGatewayModel(preview);
		if (seen.has(model.modelId)) return [];
		seen.add(model.modelId);
		return [model];
	});
}
