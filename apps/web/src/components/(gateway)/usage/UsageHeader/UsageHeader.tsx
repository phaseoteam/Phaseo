"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, Check, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { revalidateUsage } from "@/app/(dashboard)/gateway/usage/actions";

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";
type GroupBy = "model" | "key";

type ApiKeyOption = {
	id: string;
	name?: string | null;
	prefix?: string | null;
};

type UsageHeaderProps = {
	keys?: ApiKeyOption[];
	lifecycleAlerts?: {
		count: number;
		anchorId?: string;
	};
};

function parseRange(range?: string | null): RangeKey {
	const r = (range ?? "").toLowerCase();
	return r === "1h" || r === "1d" || r === "1w" || r === "1m" || r === "1y"
		? r
		: "1m";
}

function parseGroup(group?: string | null): GroupBy {
	return group === "key" ? "key" : "model";
}

function formatKeyLabel(key?: ApiKeyOption | null): string {
	if (!key) return "API key";
	const name = key.name?.trim();
	const prefix = key.prefix?.trim();
	if (name) return name;
	if (prefix) return prefix;
	return "API key";
}

function formatKeySubtitle(key?: ApiKeyOption | null): string | null {
	if (!key) return null;
	const name = key.name?.trim();
	const prefix = key.prefix?.trim();
	if (name && prefix) return prefix;
	return null;
}

export default function UsageHeader({
	keys = [],
	lifecycleAlerts,
}: UsageHeaderProps) {
	const router = useRouter();
	const [range, setRange] = useQueryState<RangeKey>("range", {
		defaultValue: "1m",
		parse: parseRange,
		serialize: (v) => v,
		shallow: false,
	});
	const [groupBy, setGroupBy] = useQueryState<GroupBy>("group", {
		defaultValue: "model",
		parse: parseGroup,
		serialize: (v) => v,
		shallow: false,
	});
	const [selectedKeyId, setSelectedKeyId] = useQueryState<string | null>(
		"key",
		{
			defaultValue: null,
			parse: (value) => (value ? value : null),
			// return empty string so the hook clears the query param when no key is selected
			serialize: (value) => value ?? "",
			shallow: false,
		}
	);
	const [refreshing, setRefreshing] = React.useState(false);

	const selectedKey = React.useMemo(
		() => keys.find((k) => k.id === selectedKeyId) ?? null,
		[keys, selectedKeyId]
	);

	const groupLabel = React.useMemo(() => {
		if (groupBy === "key") {
			if (selectedKey) {
				return `By ${formatKeyLabel(selectedKey)}`;
			}
			return "By Key";
		}
		return "By Model";
	}, [groupBy, selectedKey]);

	function handleGroupByModel() {
		void setGroupBy("model");
		void setSelectedKeyId(null);
	}

	function handleGroupByKey(keyId: string | null) {
		void setGroupBy("key");
		void setSelectedKeyId(keyId);
	}

	async function onRefresh() {
		try {
			setRefreshing(true);
			const res = await revalidateUsage();
			router.refresh();
			if (res?.ok) toast.success("Refresh Successful");
			else toast.error("Refresh Failed");
		} catch {
			toast.error("Refresh Failed");
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<div className="flex items-center justify-between mb-6">
			<h1 className="font-bold text-2xl">Usage Dashboard</h1>
			<div className="flex items-center gap-2">
				{lifecycleAlerts && lifecycleAlerts.count > 0 ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								asChild
								variant="outline"
								size="icon"
								className="relative"
								aria-label="View lifecycle alerts"
							>
								<a
									href={`#${lifecycleAlerts.anchorId ?? "lifecycle-alerts"}`}
								>
									<AlertTriangle className="h-4 w-4 text-amber-600" />
									<span className="sr-only">
										View lifecycle alerts
									</span>
									<span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
										{lifecycleAlerts.count}
									</span>
								</a>
							</Button>
						</TooltipTrigger>
						<TooltipContent sideOffset={6}>
							<div className="text-xs">
								{lifecycleAlerts.count} model
								{lifecycleAlerts.count === 1 ? "" : "s"} need attention
							</div>
						</TooltipContent>
					</Tooltip>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="flex items-center gap-2">
							<span>{groupLabel}</span>
							<ChevronDown className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuLabel>Breakdown view</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={handleGroupByModel} className="justify-between">
								<span>By model</span>
								{groupBy === "model" && <Check className="h-4 w-4" />}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>By API key</DropdownMenuSubTrigger>
								<DropdownMenuPortal>
									<DropdownMenuSubContent className="w-64 max-h-72 overflow-y-auto">
										<DropdownMenuItem
											onClick={() => handleGroupByKey(null)}
											className="justify-between"
										>
											<span>All keys</span>
											{groupBy === "key" && !selectedKeyId && (
												<Check className="h-4 w-4" />
											)}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										{keys.length === 0 ? (
											<DropdownMenuItem disabled>
												No API keys available
											</DropdownMenuItem>
										) : (
											keys.map((key) => {
												const subtitle = formatKeySubtitle(key);
												return (
													<DropdownMenuItem
														key={key.id}
														onClick={() => handleGroupByKey(key.id)}
														className="flex-col items-start gap-1"
													>
														<div className="flex items-center justify-between w-full">
															<span>{formatKeyLabel(key)}</span>
															{groupBy === "key" && selectedKeyId === key.id && (
																<Check className="h-4 w-4" />
															)}
														</div>
														{subtitle ? (
															<span className="text-xs text-muted-foreground">
																{subtitle}
															</span>
														) : null}
													</DropdownMenuItem>
												);
											})
										)}
									</DropdownMenuSubContent>
								</DropdownMenuPortal>
							</DropdownMenuSub>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<Select
					value={range}
					onValueChange={(v) => setRange(v as RangeKey)}
				>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder="Range" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="1h">Last 1 Hour</SelectItem>
						<SelectItem value="1d">Last 1 Day</SelectItem>
						<SelectItem value="1w">Last 1 Week</SelectItem>
						<SelectItem value="1m">Last 1 Month</SelectItem>
						<SelectItem value="1y">Last 1 Year</SelectItem>
					</SelectContent>
				</Select>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							onClick={onRefresh}
							aria-label="Refresh"
							disabled={refreshing}
						>
							{refreshing ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RotateCcw className="h-4 w-4" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent sideOffset={6}>Refresh</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
