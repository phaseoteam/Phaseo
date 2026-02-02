"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import UsageItem from "./UsageItem";
import EditKeyItem from "./EditKeyItem";
import DeleteKeyItem from "./DeleteKeyItem";
import KeyLimitsItem from "./KeyLimitsItem";

export default function KeysPanel({ teamsWithKeys }: any) {
	// Ensure teams that have keys are shown first, preserving original relative order.
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithKeys)) return teamsWithKeys;
		// stable partition: keep relative order within groups
		const withKeys: any[] = [];
		const withoutKeys: any[] = [];
		for (const t of teamsWithKeys) {
			if (t && Array.isArray(t.keys) && t.keys.length > 0)
				withKeys.push(t);
			else withoutKeys.push(t);
		}
		return [...withKeys, ...withoutKeys];
	}, [teamsWithKeys]);

	if (!sortedTeams || sortedTeams.length === 0) {
		return (
			<div className="mt-6 text-sm text-muted-foreground">
				No teams or keys to manage.
			</div>
		);
	}

	return (
		<div className="mt-6 space-y-6">
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"}>
					<div className="font-medium mb-2">{team.name}</div>
					{!team.keys || team.keys.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No keys for this team.
						</div>
					) : (
						<div className="space-y-4">
							{team.keys.map((k: any) => {
								const dailyLimit = k.daily_limit_requests || 0;
								const currentUsage = k.current_usage_daily || 0;
								const usagePercent = dailyLimit > 0 ? Math.min((currentUsage / dailyLimit) * 100, 100) : 0;
								const isNearLimit = usagePercent > 80;

								return (
									<div
										key={k.id}
										className="relative p-4 border rounded-md bg-white dark:bg-zinc-950"
									>
										{/* Header: Name, Status, Actions */}
										<div className="flex items-center justify-between mb-3">
											<div className="flex items-center gap-2">
												<span className="font-medium">{k.name}</span>
												<Tooltip delayDuration={0}>
													<TooltipTrigger asChild>
														<span className="relative flex size-2">
															<span
																className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
																	k.status === "active"
																		? "bg-emerald-400"
																		: k.status === "paused"
																		? "bg-amber-400"
																		: "bg-zinc-400"
																} opacity-75`}
															></span>
															<span
																className={`relative inline-flex size-2 rounded-full ${
																	k.status === "active"
																		? "bg-emerald-500"
																		: k.status === "paused"
																		? "bg-amber-500"
																		: "bg-zinc-500"
																}`}
															></span>
														</span>
													</TooltipTrigger>
													<TooltipContent>
														{k.status === "active"
															? "Active"
															: k.status === "paused"
															? "Paused"
															: "Unknown"}
													</TooltipContent>
												</Tooltip>
											</div>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label="Actions"
													>
														<MoreVertical />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent
													side="bottom"
													align="end"
												>
													<UsageItem k={k} />
													<EditKeyItem k={k} />
													<KeyLimitsItem k={k} />
													<DeleteKeyItem k={k} />
												</DropdownMenuContent>
											</DropdownMenu>
										</div>

										{/* Key Prefix */}
										<div className="font-mono text-sm text-zinc-700 dark:text-zinc-300 mb-3">
											{k.prefix}
										</div>

										{/* Details in Rows */}
										<div className="space-y-2 text-xs">
											<div className="flex justify-between">
												<div>
													<div className="text-zinc-500 dark:text-zinc-400">Last Used</div>
													<div className="font-medium">
														{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
													</div>
												</div>
												<div>
													<div className="text-zinc-500 dark:text-zinc-400">Expires</div>
													<div className="font-medium">
														{k.expires_at ? `${Math.ceil((new Date(k.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days` : 'No expiry'}
													</div>
												</div>
											</div>
											<div className="flex gap-4">
												<div className="flex-1">
													<div className="text-zinc-500 dark:text-zinc-400">Limits</div>
													<div className="flex gap-1 flex-wrap mt-1">
														{k.daily_limit_requests && (
															<Badge variant="outline" className="text-xs">
																Daily: {k.daily_limit_requests}
															</Badge>
														)}
														{k.weekly_limit_requests && (
															<Badge variant="outline" className="text-xs">
																Weekly: {k.weekly_limit_requests}
															</Badge>
														)}
														{k.monthly_limit_requests && (
															<Badge variant="outline" className="text-xs">
																Monthly: {k.monthly_limit_requests}
															</Badge>
														)}
														{!k.daily_limit_requests && !k.weekly_limit_requests && !k.monthly_limit_requests && (
															<Badge variant="outline" className="text-xs">No limits</Badge>
														)}
													</div>
												</div>
												<div className="flex-1">
													<div className="text-zinc-500 dark:text-zinc-400">Usage (Daily)</div>
													<div className="flex items-center gap-2 mt-1">
														<Progress value={usagePercent} className="flex-1" />
														<span className={`text-xs font-medium ${isNearLimit ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
															{currentUsage} / {dailyLimit || '∞'}
														</span>
													</div>
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
