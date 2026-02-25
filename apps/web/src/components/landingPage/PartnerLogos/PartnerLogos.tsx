import PartnerLogosClient from "./PartnerLogosClient";
import { listKnownLogos, resolveLogo } from "@/lib/logos";

const blockedProviderIds = new Set([
	"openrouter",
	"huggingface",
	"hugging-face",
	"ai-stats",
]);

export const excludedProviderLogos: string[] = [
	"scira",
	"t3",
	"/logos/arxiv.svg",
	"discord",
	"x",
	"github",
	"instagram",
	"reddit",
	"grok",
	"openrouter",
	"ai-stats",
	"/social/hugging_face.svg",
];

function normaliseDescriptor(value: string): string {
	if (value.startsWith("/")) return value;
	return value.toLowerCase();
}

function getProviderLogos(): string[] {
	const exclusionSet = new Set(
		excludedProviderLogos.map(normaliseDescriptor)
	);

	const allLogos = [
		...listKnownLogos()
			.filter(({ id, assets }) => {
				const normalizedId = String(id).toLowerCase();
				if (blockedProviderIds.has(normalizedId)) return false;

				const hasLanguageAsset = Object.values(assets).some((asset) =>
					asset?.startsWith("/languages/")
				);
				if (hasLanguageAsset) return false;
				const hasObservabilityAsset = Object.values(assets).some((asset) =>
					asset?.startsWith("/observability/")
				);
				if (hasObservabilityAsset) return false;
				if (id.startsWith("observability-")) return false;

				const normalisedId = normaliseDescriptor(id);
				if (exclusionSet.has(normalisedId)) return false;
				const pathCandidate = normaliseDescriptor(`/logos/${id}.svg`);
				return !exclusionSet.has(pathCandidate);
			})
			.map(({ id }) => id),
	];

	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const id of allLogos) {
		const resolved = resolveLogo(id, { fallbackToColor: false });
		const src = resolved.src;
		if (!src || seen.has(src)) continue;
		seen.add(src);
		deduped.push(id);
	}

	return deduped;
}

export default function PartnerLogos() {
	const providerLogos = getProviderLogos();
	return <PartnerLogosClient logos={providerLogos} />;
}
