import type { ProviderOfferScope } from "@/lib/providers/providerOffers";

export type GatewaySupportedModel = {
	modelId: string;
	internalModelId: string | null;
	selectorModelId: string;
	providerId: string;
	capabilities: string[];
	effectiveFrom: string | null;
	effectiveTo: string | null;
	providerName: string | null;
	providerFamilyId: string | null;
	providerOfferLabel: string | null;
	providerOfferScope: ProviderOfferScope | null;
	providerPromptTrainingPolicy: string | null;
	modelName: string | null;
	modelStatus: string | null;
	organisationId: string | null;
	organisationName: string | null;
	previousModelId: string | null;
	releaseDate: string | null;
	announcementDate: string | null;
	isAvailable: boolean;
};
