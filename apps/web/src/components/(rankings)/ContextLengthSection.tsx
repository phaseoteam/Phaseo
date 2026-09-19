import { fetchFrontendRankingContextLengths } from "@/lib/fetchers/frontend/fetchRankingSections";
import { VerticalRankingChart } from "@/components/(rankings)/VerticalRankingChart";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

function formatRequests(value: number) {
	return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export async function ContextLengthSection() {
	const result = await fetchFrontendRankingContextLengths(30).catch(() => null);
	if (!result) return <RankingUnavailable id="context-length" title="Context Length" />;
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

	return (
		<section id="context-length" className="scroll-mt-32 space-y-6 border-t border-border pt-12">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">Context Length</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Observed input-token length across gateway requests over the last {result.days} days.
				</p>
			</div>

			{rows.length ? (
				<div className="space-y-5">
					<div className="flex items-baseline justify-between gap-4">
						<div>
							<h3 className="text-lg font-semibold">Requests by Context Length</h3>
							<p className="text-sm text-muted-foreground">Input tokens per request · {total.toLocaleString()} measured requests</p>
						</div>
						<span className="text-xs text-muted-foreground">Higher bars mean more requests</span>
					</div>
					<VerticalRankingChart
						entries={rows.map((row) => ({
							key: row.key,
							label: row.label,
							value: row.requests,
							valueLabel: `${formatRequests(row.requests)} · ${row.share.toFixed(1)}%`,
						}))}
					/>
				</div>
			) : (
				<div className="border-y border-border py-8 text-sm text-muted-foreground">
					Context-length data will appear after enough requests from multiple workspaces meet the public privacy threshold.
				</div>
			)}
		</section>
	);
}
