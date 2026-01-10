import PartnerLogosClient from "./PartnerLogosClient";
import { listKnownLogos, resolveLogo } from "@/lib/logos";

const customProviderLogos: string[] = ["/social/hugging_face.svg"];

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
				const hasLanguageAsset = Object.values(assets).some((asset) =>
					asset?.startsWith("/languages/")
				);
				if (hasLanguageAsset) return false;

				const normalisedId = normaliseDescriptor(id);
				if (exclusionSet.has(normalisedId)) return false;
				const pathCandidate = normaliseDescriptor(`/logos/${id}.svg`);
				return !exclusionSet.has(pathCandidate);
			})
			.map(({ id }) => id),
		...customProviderLogos.filter(
			(src) => !exclusionSet.has(normaliseDescriptor(src))
		),
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
