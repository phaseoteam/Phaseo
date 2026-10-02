"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Trophy,
	TrendingUp,
	Sparkles,
	Target,
	Zap,
	DollarSign,
} from "lucide-react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface FunStatsProps {
	topModel: { name: string; requests: number } | null;
	topProvider: { name: string; requests: number } | null;
	mostExpensive: { name: string; cost: number } | null;
	fastestModel: { name: string; speedMs: number } | null;
	totalSaved?: number;
	streak?: { days: number; description: string };
}

export default function FunStats({
	topModel,
	topProvider,
	mostExpensive,
	fastestModel,
	totalSaved,
	streak,
}: FunStatsProps) {
	const format = useDisplayFormatters();
	const t = useTranslations("SettingsUI");
	const stats = [
		{
			icon: Trophy,
			title: t("strings.Top Model" as never),
			value: topModel?.name || t("strings.No data" as never),
			subtitle: topModel ? `${format.number(topModel.requests)} ${t("strings.requests" as never)}` : null,
			color: "text-yellow-600",
			bgColor: "bg-yellow-50",
		},
		{
			icon: Target,
			title: t("strings.Top Provider" as never),
			value: topProvider?.name || t("strings.No data" as never),
			subtitle: topProvider ? `${format.number(topProvider.requests)} ${t("strings.requests" as never)}` : null,
			color: "text-blue-600",
			bgColor: "bg-blue-50",
		},
		{
			icon: DollarSign,
			title: t("strings.Most Expensive" as never),
			value: mostExpensive?.name || t("strings.No data" as never),
			subtitle: mostExpensive ? `$${mostExpensive.cost.toFixed(5)}` : null,
			color: "text-red-600",
			bgColor: "bg-red-50",
		},
		{
			icon: Zap,
			title: t("strings.Fastest Model" as never),
			value: fastestModel?.name || t("strings.No data" as never),
			subtitle: fastestModel ? `${fastestModel.speedMs}ms avg` : null,
			color: "text-green-600",
			bgColor: "bg-green-50",
		},
	];

	if (totalSaved) {
		stats.push({
			icon: TrendingUp,
			title: "Total Saved",
			value: `$${totalSaved.toFixed(2)}`,
			subtitle: t("strings.phraseVsDirectProviderPricing" as never),
			color: "text-emerald-600",
			bgColor: "bg-emerald-50",
		});
	}

	if (streak) {
		stats.push({
			icon: Sparkles,
			title: "Streak",
			value: `${streak.days} ${t("strings.days" as never)}`,
			subtitle: streak.description,
			color: "text-purple-600",
			bgColor: "bg-purple-50",
		});
	}

	return (
		<div>
			<div className="flex items-center gap-2 mb-4">
				<Sparkles className="h-5 w-5 text-muted-foreground" />
				<h2 className="text-xl font-semibold">{t("strings.Insights & Trends" as never)}</h2>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{stats.map((stat, idx) => (
					<Card key={idx} className={`overflow-hidden ${stat.bgColor} border-none`}>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<stat.icon className={`h-4 w-4 ${stat.color}`} />
								<CardTitle className="text-sm font-medium text-muted-foreground">
									{stat.title}
								</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-1">
								<div className={`text-2xl font-bold ${stat.color} truncate`}>
									{stat.value}
								</div>
								{stat.subtitle && (
									<div className="text-sm text-muted-foreground truncate">
										{stat.subtitle}
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
