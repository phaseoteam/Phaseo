import React from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { fetchFrontendAPIProviderTopModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getLocale, getTranslations } from "next-intl/server";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default async function TopModels({
	count = 6,
	apiProviderId,
}: {
	count?: number;
	apiProviderId: string;
}) {
	const [t, locale] = await Promise.all([
		getTranslations("Catalogue.providers"),
		getLocale(),
	]);
	const topModels = await fetchFrontendAPIProviderTopModels(
		apiProviderId,
		count,
	);

	return (
		<section className="space-y-4">
			<h3 className="text-xl font-semibold">{t("topModels")}</h3>

			{topModels.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground border-b border-border">
								<th className="text-left font-medium py-2 px-2">{t("modelLabel")}</th>
								<th className="text-right font-medium py-2 px-2">{t("tokensLabel")}</th>
								<th className="text-right font-medium py-2 px-2">{t("latencyMetric")}</th>
								<th className="text-right font-medium py-2 px-2">{t("throughputMetric")}</th>
							</tr>
						</thead>
						<tbody>
							{topModels.map((model, index) => {
								const rank = index + 1;
								return (
									<tr
										key={model.model_id}
										className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
									>
										<td className="py-2 px-2 min-w-0">
											<div className="flex min-w-0 items-center gap-3">
												<span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">
													#{rank}
												</span>
												<Link
													href={`/models/${model.model_id}`}
													prefetch={false}
													className="truncate font-medium text-foreground hover:text-primary"
												>
													<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
														{model.model_name || model.model_id}
													</span>
												</Link>
											</div>
										</td>
										<td className="py-2 px-2 text-right tabular-nums">
											{(model.total_tokens ?? model.request_count).toLocaleString(locale)}
										</td>
										<td className="py-2 px-2 text-right tabular-nums">
											{model.median_latency_ms != null
												? `${model.median_latency_ms} ms`
												: "-"}
										</td>
										<td className="py-2 px-2 text-right tabular-nums">
											{model.median_throughput != null
												? `${model.median_throughput} t/s`
												: "-"}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Trophy />
						</EmptyMedia>
						<EmptyTitle>{t("noModelDataYet")}</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							{t("modelDataAppearsAfterRequests")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
