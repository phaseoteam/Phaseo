"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Trophy,
	TrendingUp,
	Sparkles,
	Target,
	Zap,
	DollarSign,
	ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

interface TopModelRow {
	modelId: string;
	organisationId: string;
	requests: number;
	spend: number;
	avgLatency: number | null;
}

interface InsightsSectionProps {
	topModels: TopModelRow[];
	topProvider: { name: string; requests: number } | null;
	mostExpensive: { name: string; cost: number } | null;
	fastestModel: { name: string; speedMs: number } | null;
}

export default function InsightsSection({
	topModels,
	topProvider,
	mostExpensive,
	fastestModel,
}: InsightsSectionProps) {
	const quickStats = [
		{
			icon: Target,
			title: "Top Provider",
			value: topProvider?.name || "No data",
			subtitle: topProvider ? `${topProvider.requests.toLocaleString()} requests` : null,
			color: "text-blue-600",
			bgColor: "bg-blue-50",
		},
		{
			icon: DollarSign,
			title: "Most Expensive",
			value: mostExpensive?.name || "No data",
			subtitle: mostExpensive ? `$${mostExpensive.cost.toFixed(5)}` : null,
			color: "text-red-600",
			bgColor: "bg-red-50",
		},
		{
			icon: Zap,
			title: "Fastest Model",
			value: fastestModel?.name || "No data",
			subtitle: fastestModel ? `${fastestModel.speedMs}ms avg` : null,
			color: "text-green-600",
			bgColor: "bg-green-50",
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Sparkles className="h-5 w-5 text-muted-foreground" />
				<h2 className="text-xl font-semibold">Insights & Trends</h2>
			</div>

			{/* Quick Stats Row */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{quickStats.map((stat, idx) => (
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

			{/* Top Models by Spend */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Trophy className="h-5 w-5 text-yellow-600" />
						<CardTitle>Top Models by Spend</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					{topModels.length === 0 ? (
						<p className="text-sm text-muted-foreground">No data available</p>
					) : (
						<div className="space-y-3">
							{topModels.map((model, idx) => (
								<Link
									key={model.modelId}
									href={`/models/${model.organisationId}/${model.modelId}`}
									className="group block"
								>
									<div className="flex items-center gap-4 p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors">
										{/* Rank Badge */}
										<div
											className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
												idx === 0
													? "bg-yellow-100 text-yellow-700"
													: idx === 1
														? "bg-gray-100 text-gray-700"
														: idx === 2
															? "bg-orange-100 text-orange-700"
															: "bg-muted text-muted-foreground"
											}`}
										>
											{idx + 1}
										</div>

										{/* Logo */}
										<div className="flex-shrink-0">
											<Logo
												id={model.organisationId}
												width={32}
												height={32}
												className="rounded-md"
											/>
										</div>

										{/* Model Info */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="font-semibold truncate group-hover:text-primary transition-colors">
													{model.modelId}
												</span>
												<ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
											</div>
											<div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
												<span>{model.requests.toLocaleString()} requests</span>
												{model.avgLatency && (
													<span>{Math.round(model.avgLatency)}ms avg</span>
												)}
											</div>
										</div>

										{/* Cost */}
										<div className="text-right flex-shrink-0">
											<div className="font-mono font-semibold text-lg">
												${model.spend.toFixed(2)}
											</div>
											<div className="text-xs text-muted-foreground">total spend</div>
										</div>
									</div>
								</Link>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
