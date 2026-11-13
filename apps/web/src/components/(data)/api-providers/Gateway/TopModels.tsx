import React from "react";
import Link from "@/components/link";
import { Trophy } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { apiProviderTopModelsQuery } from "../apiProvider.queries";
import { useLocale, useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DisplayCount } from "@/components/display/DisplayValue";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default function TopModels({
	count = 6,
	apiProviderId,
}: {
	count?: number;
	apiProviderId: string;
}) {
	const t = useTranslations("Catalogue.providers");
	const locale = useLocale();
	const { data: topModels } = useSuspenseQuery(apiProviderTopModelsQuery(
		apiProviderId,
		count,
	));

	return (
		<section className="space-y-4">
			<h3 className="text-xl font-semibold">{t("topModels")}</h3>

			{topModels.length > 0 ? (
				<div className="overflow-x-auto">
					<Table wrapInContainer={false} className="w-full min-w-[640px] text-sm">
						<TableHeader>
							<TableRow className="text-xs text-muted-foreground border-b border-border hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-left font-medium py-2 px-2">{t("modelLabel")}</TableHead>
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-right font-medium py-2 px-2">{t("tokensLabel")}</TableHead>
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-right font-medium py-2 px-2">{t("latencyMetric")}</TableHead>
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-right font-medium py-2 px-2">{t("throughputMetric")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{topModels.map((model, index) => {
								const rank = index + 1;
								return (
									<TableRow
										key={model.model_id}
										className="border-b border-border/60 last:border-b-0 hover:bg-muted/20 dark:hover:bg-muted/20"
									>
										<TableCell className="p-0 py-2 px-2 min-w-0">
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
										</TableCell>
										<TableCell className="p-0 py-2 px-2 text-right tabular-nums">
											<DisplayCount value={model.total_tokens ?? model.request_count} />
										</TableCell>
										<TableCell className="p-0 py-2 px-2 text-right tabular-nums">
											{model.median_latency_ms != null
												? `${model.median_latency_ms} ms`
												: "-"}
										</TableCell>
										<TableCell className="p-0 py-2 px-2 text-right tabular-nums">
											{model.median_throughput != null
												? `${model.median_throughput} t/s`
												: "-"}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
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
