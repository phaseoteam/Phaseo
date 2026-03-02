import React from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getTopModelsCached } from "@/lib/fetchers/api-providers/api-provider/top-models";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";
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
	const includeHidden = await resolveIncludeHidden();
	const topModels = await getTopModelsCached(apiProviderId, includeHidden, count);

	return (
		<section className="space-y-4">
			<h3 className="text-xl font-semibold">Top models</h3>

			{topModels.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground border-b border-border">
								<th className="text-left font-medium py-2 px-2">Model</th>
								<th className="text-right font-medium py-2 px-2">Tokens</th>
								<th className="text-right font-medium py-2 px-2">Latency</th>
								<th className="text-right font-medium py-2 px-2">Throughput</th>
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
											{(model.total_tokens ?? model.request_count).toLocaleString()}
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
						<EmptyTitle>No model data yet</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							Performance data appears here once requests are processed
							through the gateway.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
