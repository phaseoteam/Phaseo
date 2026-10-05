import { GeographyUsage } from "@/components/(gateway)/usage/GeographyUsage";
import { fetchFrontendRankingGeography } from "@/lib/fetchers/frontend/fetchRankingSections";
import { getTranslations } from "next-intl/server";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { connection } from "next/server";

export async function PublicGeography() {
	// Keep API failures out of the static shell so retries can fetch fresh data.
	await connection();
	const t = await getTranslations("Catalogue.rankings");
	const result = await fetchFrontendRankingGeography(30).catch(() => null);
	if (!result) return <RankingUnavailable id="geography" title={t("countries")} />;
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
