"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	TrendingUp,
	TrendingDown,
	CreditCard,
	BarChart3,
	CaseUpper,
	ArrowRightLeft,
} from "lucide-react";
import NumberFlow, { type Format } from "@number-flow/react";
import {
	useDisplayFormatters,
	useDisplayPreferences,
} from "@/components/providers/DisplayPreferencesProvider";

type Delta = { percent: number | null };

function DeltaBadge({ percent }: Delta) {
	if (percent == null) return null;
	const positive = percent >= 0;
	const Icon = positive ? TrendingUp : TrendingDown;
	const text = `${positive ? "+" : ""}${(percent * 100).toFixed(1)}%`;
	const color = positive
		? "bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
		: "bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:hover:bg-rose-900";
	const iconColor = positive ? "text-green-500" : "text-rose-500";
	return (
		<Badge
			className={cn(
				"px-2 py-1 rounded-full gap-1 transition-colors",
				color
			)}
			title={text}
		>
			<Icon className={cn("w-3 h-3", iconColor)} />
			{text}
		</Badge>
	);
}

export default function UsageStatCards(props: {
	periodLabel: string;
	cards: Array<{
		icon: "spend" | "requests" | "tokens";
		title: string;
		value: number;
		format?: Format; // <— was string
		prefix?: string;
		suffix?: string;
		delta: { percent: number | null };
	}>;
}) {
	const display = useDisplayFormatters();
	const { preferences } = useDisplayPreferences();
	const iconMap: Record<string, any> = {
		spend: CreditCard,
		requests: ArrowRightLeft,
		tokens: CaseUpper, // or Binary if you prefer the more technical look
	};
	const iconColorMap: Record<string, string> = {
		spend: "text-green-600",
		requests: "text-blue-600",
		tokens: "text-violet-600",
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{props.cards.map((c, i) => {
				const Icon = iconMap[c.icon] ?? BarChart3;
				const iconColor =
					iconColorMap[c.icon] ?? "text-muted-foreground";

				return (
					<Card key={i}>
						<CardContent className="flex flex-col h-full p-5">
							<div className="flex items-center justify-between mb-6">
								<Icon className={cn("h-6 w-6", iconColor)} />
								<DeltaBadge percent={c.delta.percent} />
							</div>

							<div className="flex-1 flex flex-col justify-between">
								<div>
									<div className="text-sm font-medium text-muted-foreground mb-1">
										{c.title}
									</div>

									{/* NumberFlow-driven value */}
									<div className="text-3xl font-bold text-foreground mb-4 flex items-baseline gap-1">
										{c.prefix ? (
											<span
												aria-hidden
												className="opacity-80"
											>
												{c.prefix}
											</span>
										) : null}
										<NumberFlow
											value={c.value}
											locales={preferences.locale === "system" ? undefined : preferences.locale}
											// duration={0.8}
											format={
												c.format ??
												(c.icon === "spend"
													? {
															style: "currency",
															currency: "USD",
															currencyDisplay:
																"narrowSymbol",
															maximumFractionDigits: 2,
													  }
													: {
															useGrouping: true,
															notation: preferences.numberNotation,
															minimumFractionDigits: 0,
															maximumFractionDigits: 0,
													  })
											}
											className="leading-none"
											aria-label={`${c.title}: ${display.number(c.value, {
												minimumFractionDigits: 0,
												maximumFractionDigits: 2,
											})}`}
										/>
										{c.suffix ? (
											<span
												aria-hidden
												className="opacity-80"
											>
												{c.suffix}
											</span>
										) : null}
									</div>
								</div>

								<div className="pt-2 border-t border-muted text-xs text-muted-foreground font-medium">
									{props.periodLabel}
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
