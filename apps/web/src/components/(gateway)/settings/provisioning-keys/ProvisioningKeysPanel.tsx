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
import ProvisioningKeyUsageItem from "./ProvisioningKeyUsageItem";
import EditProvisioningKeyItem from "./EditProvisioningKeyItem";
import DeleteProvisioningKeyItem from "./DeleteProvisioningKeyItem";
import ProvisioningKeyLimitsItem from "./ProvisioningKeyLimitsItem";

export default function ProvisioningKeysPanel({ teamsWithKeys }: any) {
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithKeys)) return teamsWithKeys;
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
				No teams or management API keys to manage.
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
							No management API keys for this team.
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{team.keys.map((k: any) => (
								<div
									key={k.id}
									className="relative p-4 border rounded-md bg-white dark:bg-zinc-950 border-amber-200 dark:border-amber-900/50"
								>
									<div className="flex items-center">
										<div className="flex items-center flex-1">
											<div>
												<div className="mb-2 font-medium flex items-center gap-2">
													<span>{k.name}</span>

													<Tooltip delayDuration={0}>
														<TooltipTrigger asChild>
															<span className="relative flex size-2">
																<span
																	className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
																		k.status ===
																		"active"
																			? "bg-emerald-400"
																			: k.status ===
																			  "paused"
																			? "bg-amber-400"
																			: "bg-zinc-400"
																	} opacity-75`}
																></span>
																<span
																	className={`relative inline-flex size-2 rounded-full ${
																		k.status ===
																		"active"
																			? "bg-emerald-500"
																			: k.status ===
																			  "paused"
																			? "bg-amber-500"
																			: "bg-zinc-500"
																	}`}
																></span>
															</span>
														</TooltipTrigger>
														<TooltipContent>
															{k.status ===
															"active"
																? "Active"
																: k.status ===
																  "paused"
																? "Paused"
																: "Unknown"}
														</TooltipContent>
													</Tooltip>
												</div>

												<div className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
													{k.prefix}
												</div>
											</div>
										</div>
										<div className="ml-2">
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
													<ProvisioningKeyUsageItem k={k} />
													<EditProvisioningKeyItem k={k} />
													<ProvisioningKeyLimitsItem k={k} />
													<DeleteProvisioningKeyItem k={k} />
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
