import {
	formatProviderOfferDisplayName,
	inferProviderFamilyIdFromSiblings,
	resolveProviderLogoId,
	type ProviderOfferScope,
} from "@/lib/providers/providerOffers";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { formatOrgLabel } from "@/components/(chat)/playground/chat-playground-core";

export type ChatProviderOption = {
	id: string;
	name: string;
	logoId: string;
};

const REGIONAL_PROVIDER_SUFFIXES = [
	["-eu", "EU"],
	["-us", "US"],
] as const;

function getFallbackRegionalLabel(providerId: string): string | null {
	const normalizedProviderId = providerId.trim().toLowerCase();
	for (const [suffix, label] of REGIONAL_PROVIDER_SUFFIXES) {
		if (normalizedProviderId.endsWith(suffix)) {
			return label;
		}
	}
	return null;
}

function getFallbackProviderFamilyId(providerId: string): string | null {
	const normalizedProviderId = providerId.trim();
	const normalizedProviderIdLower = normalizedProviderId.toLowerCase();
	for (const [suffix] of REGIONAL_PROVIDER_SUFFIXES) {
		if (!normalizedProviderIdLower.endsWith(suffix)) continue;
		return normalizedProviderId.slice(0, -suffix.length) || null;
	}
	return null;
}

function stripTrailingRegionLabel(providerName: string, label: string | null): string {
	if (!label) return providerName;
	return (
		providerName
			.replace(new RegExp(`\\s+${label}$`, "i"), "")
			.trim() || providerName
	);
}

function resolveProviderBaseName(args: {
	model: GatewaySupportedModel;
	providerNameById: Map<string, string>;
	fallbackRegionalLabel: string | null;
}): string {
	const familyProviderName = args.model.providerFamilyId
		? args.providerNameById.get(args.model.providerFamilyId)
		: null;
	if (familyProviderName) return familyProviderName;
	const providerName =
		args.model.providerName?.trim() || formatOrgLabel(args.model.providerId);
	return stripTrailingRegionLabel(providerName, args.fallbackRegionalLabel);
}

function resolveProviderOfferScope(
	model: GatewaySupportedModel,
	fallbackRegionalLabel: string | null,
): ProviderOfferScope | null {
	if (model.providerOfferScope) return model.providerOfferScope;
	if (fallbackRegionalLabel) return "regional";
	return null;
}

export function buildChatProviderOptions(
	models: GatewaySupportedModel[],
): ChatProviderOption[] {
	const knownProviderIds = new Set(models.map((model) => model.providerId));
	const providerNameById = new Map<string, string>();
	for (const model of models) {
		if (!providerNameById.has(model.providerId)) {
			providerNameById.set(
				model.providerId,
				model.providerName?.trim() || formatOrgLabel(model.providerId),
			);
		}
	}

	const map = new Map<string, ChatProviderOption>();
	for (const model of models) {
		if (map.has(model.providerId)) continue;
		const fallbackRegionalLabel = getFallbackRegionalLabel(model.providerId);
		const explicitProviderFamilyId = model.providerFamilyId?.trim() || null;
		const providerFamilyId =
			explicitProviderFamilyId ??
			inferProviderFamilyIdFromSiblings({
				providerId: model.providerId,
				knownProviderIds,
			}) ??
			getFallbackProviderFamilyId(model.providerId);
		const providerName = resolveProviderBaseName({
			model,
			providerNameById,
			fallbackRegionalLabel,
		});
		const offerLabel = model.providerOfferLabel ?? fallbackRegionalLabel;
		const offerScope = resolveProviderOfferScope(model, fallbackRegionalLabel);

		map.set(model.providerId, {
			id: model.providerId,
			name: formatProviderOfferDisplayName({
				providerId: model.providerId,
				providerName,
				offerLabel,
				offerScope,
			}),
			logoId: resolveProviderLogoId({
				providerId: model.providerId,
				providerFamilyId,
			}),
		});
	}

	return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
