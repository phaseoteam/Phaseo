import type { Metadata } from "@/lib/seo/metadataTypes";
import { notFound } from "@/lib/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { comparePairDataQuery } from "./pairPage.queries";
import { ComparePairDashboard } from "@/components/(data)/compare/CompareDashboard";
import { ComparePairSummary } from "@/components/(data)/compare/ComparePairSummary";
import { pairPath, sortPair } from "@/components/(data)/compare/comparePairs";
import { loadComparePairData } from "@/components/(data)/compare/loadCompare";
import { toCompareModelOption } from "@/components/(data)/compare/types";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { SITE_URL } from "@/lib/seo";
import type { PublicLocale } from "@/i18n/routing";

/**
 * `/compare/a-vs-b`: one comparison with its own indexable URL. Either order
 * renders, and both name the sorted order as canonical.
 */
export async function comparePairMetadata(ids: [string, string], locale: PublicLocale): Promise<Metadata> {
	const { view } = await loadComparePairData(sortPair(ids));
	if (view.models.length !== 2) return {};
	const [a, b] = view.models;
	// Metadata runs on the server only; keep next-intl/server out of the component graph.
	const { getTranslations } = await import("@/i18n/server");
	const t = await getTranslations({ locale, namespace: "Catalogue.comparePair" });
	return buildLocalizedPageMetadata({
		locale,
		pathname: pairPath(ids),
		title: t("metaTitle", { a: a!.name, b: b!.name }),
		description: t("metaDescription", { a: a!.name, labA: a!.lab.name, b: b!.name, labB: b!.lab.name }),
		keywords: [`${a!.name} vs ${b!.name}`, `${b!.name} vs ${a!.name}`, a!.name, b!.name, "AI model comparison"],
		openGraph: { type: "website" },
	});
}

// Unknown pairs 404 in the route loader before rendering (pairPage.queries.ts).
export function ComparePairPage({ ids, locale }: { ids: [string, string]; locale: PublicLocale }) {
	const { data: { view, usage, related } } = useSuspenseQuery(comparePairDataQuery(ids));
	if (view.models.length !== 2) notFound();
	// Keep the order the URL names, so "b-vs-a" shows b first.
	const ordered = ids.map((id) => view.models.find((model) => model.id === id)).filter((model) => model !== undefined);
	if (ordered.length !== 2) notFound();
	const models = ordered as [typeof ordered[number], typeof ordered[number]];
	return (
		<main className="flex min-h-screen flex-col">
			<section className="w-full">
				<ComparePairDashboard
					selectedOptions={models.map(toCompareModelOption)}
					view={{ ...view, models }}
					usage={usage}
					ids={ids}
				/>
			</section>
			<ComparePairSummary locale={locale} baseUrl={SITE_URL} models={models} usage={usage} peers={view.peers ?? []} related={related} />
		</main>
	);
}
