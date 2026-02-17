import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import type { ExtendedModel } from "@/data/types";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";
import { getComparisonModelsCached } from "@/lib/fetchers/compare/getComparisonModels";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import CompareMiniHeader from "@/components/(data)/compare/CompareMiniHeader";

export const metadata: Metadata = buildMetadata({
	title: "Compare AI Models Side-by-Side | AI Stats",
	description:
		"Stack up to four AI models with benchmarks in common, gateway performance, pricing, context windows, and subscription availability in one shareable view.",
	path: "/compare",
	keywords: [
		"AI model comparison",
		"compare AI models",
		"AI benchmarks",
		"AI model pricing",
		"machine learning models",
		"AI providers",
		"AI gateway performance",
		"AI Stats",
	],
	imagePath: "/compare/opengraph-image",
	imageAlt: "AI Stats model comparison preview",
	openGraph: {
		type: "website",
	},
});

type PageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

const decodeModelIdFromUrl = (value: string): string => {
	const trimmed = value?.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) return trimmed;
	if (!trimmed.includes("_")) return trimmed;
	const [organisationId, ...rest] = trimmed.split("_");
	if (!organisationId || rest.length === 0) return trimmed;
	return `${organisationId}/${rest.join("_")}`;
};

const normalizeSelection = (value: string | string[] | undefined): string[] => {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return [value];
};

export default async function Page({ searchParams }: PageProps = {}) {
	const includeHidden = false;
	const [models, resolvedSearchParams] = await Promise.all([
		loadCompareModelsCached(includeHidden),
		searchParams,
	]);
	const typedModels = models as ExtendedModel[];
	const selection = normalizeSelection(resolvedSearchParams?.models).map(
		decodeModelIdFromUrl
	);

	const lookup = new Map<string, string>();
	typedModels.forEach((model) => {
		if (!model.id) return;
		lookup.set(model.id, model.id);
	});

	const resolvedIds = selection
		.map((value) => lookup.get(value) ?? value)
		.filter((value): value is string => Boolean(value));

	const comparisonData = resolvedIds.length
		? await getComparisonModelsCached(resolvedIds, includeHidden)
		: [];

	return (
		<main className="flex min-h-screen flex-col">
			<CompareMiniHeader models={typedModels} />
			<section className="container mx-auto px-4 py-8">
				<CompareDashboard
					models={typedModels}
					comparisonData={comparisonData}
				/>
			</section>
		</main>
	);
}
