import { fetchFrontendRankingContextLengths } from "@/lib/fetchers/frontend/fetchRankingSections";
import { VerticalRankingChart } from "@/components/(rankings)/VerticalRankingChart";
import { getLocale, getTranslations } from "next-intl/server";

function formatRequests(value: number, locale: string) {
	return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export async function ContextLengthSection() {
	const [t, locale] = await Promise.all([
		getTranslations("Catalogue.rankings"),
		getLocale(),
	]);
	const result = await fetchFrontendRankingContextLengths(30).catch(() => ({ data: [], days: 30 }));
	const rows = result.data
		.map((row) => ({
			key: row.bucket_key,
			label: row.bucket_label,
			order: Number(row.bucket_order),
			requests: Number(row.requests),
			share: Number(row.share_percent),
		}))
		.filter((row) => Number.isFinite(row.requests) && row.requests >= 0)
		.sort((left, right) => left.order - right.order);
	const total = rows.reduce((sum, row) => sum + row.requests, 0);
	const numberFormat = new Intl.NumberFormat(locale);
	const percentFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

	return (
		<section id="context-length" className="scroll-mt-32 space-y-6 border-t border-border pt-12">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">{t("contextLength")}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{t("contextLengthDescription", { days: numberFormat.format(result.days) })}
				</p>
			</div>

			{rows.length ? (
				<div className="space-y-5">
					<div className="flex items-baseline justify-between gap-4">
						<div>
							<h3 className="text-lg font-semibold">{t("requestsByContextLength")}</h3>
							<p className="text-sm text-muted-foreground">{t("inputTokenRequestSummary", { count: numberFormat.format(total) })}</p>
						</div>
						<span className="text-xs text-muted-foreground">{t("higherBarsMeanMoreRequests")}</span>
					</div>
					<VerticalRankingChart
						entries={rows.map((row) => ({
							key: row.key,
							label: row.label,
							value: row.requests,
							valueLabel: `${formatRequests(row.requests, locale)} · ${percentFormat.format(row.share)}%`,
						}))}
					/>
				</div>
			) : (
				<div className="border-y border-border py-8 text-sm text-muted-foreground">
					{t("contextLengthThresholdNotice")}
				</div>
			)}
		</section>
	);
}
