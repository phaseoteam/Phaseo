import React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { getTopAppsCached } from "@/lib/fetchers/api-providers/api-provider/top-apps";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default async function TopApps({
	count = 20,
	apiProviderId,
	period = "day",
}: {
	count?: number;
	apiProviderId: string;
	period?: "day" | "week" | "month";
}) {
	const topApps = await getTopAppsCached(apiProviderId, period, count);

	return (
		<section className="space-y-4">
			<h3 className="text-xl font-semibold">Top apps</h3>

			{topApps.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground border-b border-border">
								<th className="text-left font-medium py-2 px-2">App</th>
								<th className="text-right font-medium py-2 px-2">Tokens</th>
								<th className="text-right font-medium py-2 px-2">Website</th>
							</tr>
						</thead>
						<tbody>
							{topApps.map((app, index) => (
								<tr
									key={app.app_id}
									className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
								>
									<td className="py-2 px-2 min-w-0">
										<div className="flex min-w-0 items-center gap-3">
											<span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">
												#{index + 1}
											</span>
											<Link
												href={`/apps/${app.app_id}`}
												className="flex min-w-0 items-center gap-2"
											>
												<Avatar className="h-5 w-5 rounded-md border border-border/60">
													<AvatarImage
														src={app.image_url ?? undefined}
														alt={app.title}
														className="object-cover"
													/>
													<AvatarFallback className="rounded-md text-[10px] font-semibold">
														{app.title.slice(0, 1).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="truncate font-medium text-foreground hover:text-primary">
													<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
														{app.title}
													</span>
												</span>
											</Link>
										</div>
									</td>
									<td className="py-2 px-2 text-right tabular-nums">
										{app.total_tokens.toLocaleString()}
									</td>
									<td className="py-2 px-2 text-right">
										{app.url && app.url !== "about:blank" ? (
											<a
												href={app.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-foreground hover:text-primary text-xs font-medium"
											>
												Visit
											</a>
										) : (
											<span className="text-muted-foreground text-xs">-</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Users />
						</EmptyMedia>
						<EmptyTitle>No app data yet</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							App usage data appears here once requests are processed through
							the gateway.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
