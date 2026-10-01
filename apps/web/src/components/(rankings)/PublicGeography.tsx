import { GeographyUsage } from "@/components/(gateway)/usage/GeographyUsage";
import { fetchFrontendRankingGeography } from "@/lib/fetchers/frontend/fetchRankingSections";
import { getTranslations } from "next-intl/server";

export async function PublicGeography() {
	const t = await getTranslations("Catalogue.rankings");
	const result = await fetchFrontendRankingGeography(30).catch(() => ({ data: [], days: 30 }));
	const rows = (result.data ?? []).map((row) => ({
		countryCode: row.country_code,
		requests: Number(row.requests ?? 0),
		tokens: Number(row.tokens ?? 0),
		sharePercent: Number(row.share_percent ?? 0),
	}));

	return (
		<section
			id="geography"
			className="scroll-mt-32 space-y-4 border-t border-border pt-12"
		>
			<div>
				<h2 className="text-2xl font-semibold leading-8">{t("title")}</h2>
				<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
					{t("geographyDescription")}
				</p>
			</div>
			<GeographyUsage rows={rows} publicView />
		</section>
	);
}
