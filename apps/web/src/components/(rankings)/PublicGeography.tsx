import { GeographyUsage } from "@/components/(gateway)/usage/GeographyUsage";
import { fetchFrontendRankingGeography } from "@/lib/fetchers/frontend/fetchRankingSections";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

export async function PublicGeography() {
	const result = await fetchFrontendRankingGeography(30).catch(() => null);
	if (!result) return <RankingUnavailable id="geography" title="Countries" />;
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
				<h2 className="text-2xl font-semibold leading-8">Countries</h2>
				<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
					Where Phaseo gateway traffic originated over the last 30 days, based on the country recorded at the gateway edge.
				</p>
			</div>
			<GeographyUsage rows={rows} publicView />
		</section>
	);
}
