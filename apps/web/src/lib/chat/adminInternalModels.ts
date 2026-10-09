import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export function adminSourceToChatModels(source: AdminModelSource, now = Date.now()): GatewaySupportedModel[] {
	const model = source.model;
	if (!model?.hidden || ["disabled", "retired"].includes(model.status)) return [];
	const inWindow = (row: Record<string, any>) => !row.effective_to || Date.parse(row.effective_to) > now;
	const lab = Array.isArray(model.lab) ? model.lab[0] : model.lab;
	return source.providerRows.flatMap((route) => {
		// The admin source redacts stealth routes to a synthetic provider that
		// cannot be used as a gateway provider lock.
		if (route.provider_id === "stealth") return [];
		if (route.access_scope !== "internal" || !["testing", "enabled"].includes(route.phaseo_status) ||
			route.routing_status !== "active" ||
			!["available", "preview", "limited_access", "coming_soon"].includes(route.provider_availability_status) || !inWindow(route)) return [];
		const capabilities = (route.data_api_provider_model_capabilities ?? []).filter((cap: Record<string, any>) =>
			cap.capability_id === "text.generate" && ["active", "internal_testing"].includes(cap.status) && inWindow(cap));
		if (!capabilities.length) return [];
		const provider = route.data_api_providers;
		return [{
			isInternal: true,
			modelId: source.canonicalApiId, selectorModelId: source.canonicalApiId, internalModelId: source.canonicalApiId,
			providerId: route.provider_id, providerName: provider?.api_provider_name ?? route.provider_id,
			providerFamilyId: null, providerOfferLabel: null, providerOfferScope: null, providerPromptTrainingPolicy: null,
			capabilities: ["text.generate"], inputModalities: route.input_modalities ?? [], outputModalities: route.output_modalities ?? [],
			effectiveFrom: null, effectiveTo: route.effective_to ?? null,
			modelName: model.name, modelStatus: model.catalogue_status ?? model.status,
			organisationId: model.lab_slug, organisationName: lab?.name ?? model.lab_slug,
			previousModelId: null, releaseDate: model.released_at ?? null, announcementDate: model.announced_at ?? null,
			inputPricePerMillion: null, outputPricePerMillion: null, isAvailable: true,
		}];
	});
}
