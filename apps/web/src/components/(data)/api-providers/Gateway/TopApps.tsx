import React from "react";
import Link from "next/link";
import { getTopAppsCached } from "@/lib/fetchers/api-providers/api-provider/top-apps";
import { TrendingUp, ExternalLink, Trophy, Users } from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";

function getRankIcon(rank: number) {
	switch (rank) {
		case 1:
			return "ðŸ¥‡";
		case 2:
			return "ðŸ¥ˆ";
		case 3:
			return "ðŸ¥‰";
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

function formatPeriod(period: 'day' | 'week' | 'month') {
	switch (period) {
		case 'day':
			return '24h';
		case 'week':
			return '7 days';
		case 'month':
			return '30 days';
	}
}

export default async function TopApps({
	count = 20,
	apiProviderId,
	period = 'day',
}: {
	count?: number;
	apiProviderId: string;
	period?: 'day' | 'week' | 'month';
}) {
	const topApps = await getTopAppsCached(apiProviderId, period, count);

	return (
		<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
			<div className="mb-6">
				<h3 className="text-xl font-semibold mb-2">
					Top Apps - Token Usage ({formatPeriod(period)})
				</h3>
				<p className="text-sm text-muted-foreground">
					Apps ranked by total token consumption. Encourage more apps to use your API with free promo!
				</p>
			</div>
			{topApps.length > 0 ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
					{topApps.map((app, index) => {
						const rank = index + 1;
						return (
							<div
								key={app.app_id}
								className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
							>
								<div className="flex items-center justify-between mb-3">
									<Link
										href={`/apps/${app.app_id}`}
										className="font-semibold text-sm truncate pr-8 leading-tight"
									>
										<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
											{app.title}
										</span>
									</Link>
									<div className="text-xs font-bold text-muted-foreground">
										#{rank}
									</div>
								</div>

								<div className="space-y-3">
									{/* Total tokens */}
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<TrendingUp className="h-3 w-3" />
											Tokens Used
										</div>
										<span className="text-xs font-medium">
											{app.total_tokens.toLocaleString()}
										</span>
									</div>

									{/* URL if available */}
									{app.url && app.url !== 'about:blank' && (
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<ExternalLink className="h-3 w-3" />
												Website
											</div>
											<a
												href={app.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-xs font-medium text-foreground transition-colors truncate max-w-24"
											>
												<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
													Visit
												</span>
											</a>
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
							<Users />
						</EmptyMedia>
						<EmptyTitle>No App Data Yet</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							App usage data will appear here as requests are processed through the gateway.
							Start building apps and encourage adoption with free promo!
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}
