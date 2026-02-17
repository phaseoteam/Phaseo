import React from "react";
import Link from "next/link";
import { getTopModelsCached } from "@/lib/fetchers/api-providers/api-provider/top-models";
import { TrendingUp, Clock, Zap, Trophy } from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

function getRankIcon(rank: number) {
	switch (rank) {
		case 1:
			return "🥇";
		case 2:
			return "🥈";
		case 3:
			return "🥉";
		default:
			return `#${rank}`;
	}
}

function getRankColor(rank: number) {
	switch (rank) {
		case 1:
			return "from-yellow-400 to-amber-500";
		case 2:
			return "from-gray-300 to-slate-400";
		case 3:
			return "from-orange-400 to-amber-600";
		default:
			return "from-blue-400 to-indigo-500";
	}
}

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
		<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
			<div className="mb-6">
				<h3 className="text-xl font-semibold mb-2">
					Top Models - Performance (24h)
				</h3>
				<p className="text-sm text-muted-foreground">
					Models ranked by request volume with median latency and
					throughput metrics.
				</p>
			</div>
			{topModels.length > 0 ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
					{topModels.map((model, index) => {
						const rank = index + 1;
						return (
							<div
								key={model.model_id}
								className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
							>
								<div className="flex items-center justify-between mb-3">
									<h4 className="font-semibold text-sm truncate pr-8 leading-tight">
										<Link
											href={`/models/${model.model_id}`}
											prefetch={false}
											className="inline-block text-foreground hover:text-primary"
										>
											<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
												{model.model_name ||
													model.model_id}
											</span>
										</Link>
									</h4>
									<div className="text-xs font-bold text-muted-foreground">
										#{rank}
									</div>
								</div>

								<div className="space-y-3">
									{/* Token count */}
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<TrendingUp className="h-3 w-3" />
											Tokens
										</div>
										<span className="text-xs font-medium">
											{(
												model.total_tokens ??
												model.request_count
											).toLocaleString()}
										</span>
									</div>

									{model.median_latency_ms != null && (
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<Clock className="h-3 w-3" />
												Median Latency
											</div>
											<span className="text-xs font-medium">
												{model.median_latency_ms}ms
											</span>
										</div>
									)}

									{model.median_throughput != null && (
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<Zap className="h-3 w-3" />
												Median Throughput
											</div>
											<span className="text-xs font-medium">
												{model.median_throughput}t/s
											</span>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<Empty size="compact">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Trophy />
						</EmptyMedia>
						<EmptyTitle>No Model Data Yet</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							Performance data will appear here as requests are
							processed through the gateway. Check back after some
							API calls have been made.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}
