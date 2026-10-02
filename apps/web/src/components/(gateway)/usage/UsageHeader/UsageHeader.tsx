"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import { Check, ChevronDown, Loader2, RotateCcw } from "lucide-react";
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

function formatKeyLabel(key?: ApiKeyOption | null, fallback = "API key"): string {
	if (!key) return fallback;
	const name = key.name?.trim();
	const prefix = key.prefix?.trim();
	if (name) return name;
	if (prefix) return prefix;
	return fallback;
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
}: UsageHeaderProps) {
	const t = useTranslations("SettingsUI");
	const rangeItems: Array<{ value: RangeKey; label: string }> = [
		{ value: "1h", label: t("strings.Last 1 Hour" as never) },
		{ value: "1d", label: t("strings.Last 1 Day" as never) },
		{ value: "1w", label: t("strings.Last 1 Week" as never) },
		{ value: "1m", label: t("strings.Last 1 Month" as never) },
		{ value: "1y", label: t("strings.Last 1 Year" as never) },
	];
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
				return `${t("strings.By Key" as never)}: ${formatKeyLabel(selectedKey, t("strings.API key" as never))}`;
			}
			return t("strings.By Key" as never);
		}
		return t("strings.By Model" as never);
	}, [groupBy, selectedKey, t]);

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
                        const res = await revalidateUsage("dashboard");
                        router.refresh();
						if (res?.ok) toast.success(t("strings.Refresh Successful" as never));
						else toast.error(t("strings.Refresh Failed" as never));
		} catch {
			toast.error(t("strings.Refresh Failed" as never));
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<div className="flex items-center justify-between mb-6">
			<h1 className="font-bold text-2xl">{t("strings.Usage Dashboard" as never)}</h1>
			<div className="flex items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger render={<Button variant="outline" className="flex items-center gap-2" />}>

							<span>{groupLabel}</span>
							<ChevronDown className="h-4 w-4" />

					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuLabel>{t("strings.Breakdown view" as never)}</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={handleGroupByModel} className="justify-between">
								<span>{t("strings.By model" as never)}</span>
								{groupBy === "model" && <Check className="h-4 w-4" />}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>{t("strings.By API key" as never)}</DropdownMenuSubTrigger>
								<DropdownMenuPortal>
									<DropdownMenuSubContent className="w-64 max-h-72 overflow-y-auto">
										<DropdownMenuItem
											onClick={() => handleGroupByKey(null)}
											className="justify-between"
										>
											<span>{t("strings.All keys" as never)}</span>
											{groupBy === "key" && !selectedKeyId && (
												<Check className="h-4 w-4" />
											)}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										{keys.length === 0 ? (
											<DropdownMenuItem disabled>
												{t("strings.No API keys available" as never)}
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
																<span>{formatKeyLabel(key, t("strings.API key" as never))}</span>
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
					items={rangeItems}
					onValueChange={(v) => setRange(v as RangeKey)}
				>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder={t("strings.Range" as never)} />
					</SelectTrigger>
					<SelectContent>
						{rangeItems.map((item) => (
							<SelectItem key={item.value} value={item.value} label={item.label}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							onClick={onRefresh}
							aria-label={t("strings.Refresh" as never)}
							disabled={refreshing}
						>
							{refreshing ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RotateCcw className="h-4 w-4" />
							)}
						</Button>
					</TooltipTrigger>
						<TooltipContent sideOffset={6}>{t("strings.Refresh" as never)}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
