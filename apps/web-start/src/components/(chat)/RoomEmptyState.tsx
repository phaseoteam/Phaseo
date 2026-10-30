"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { useInitialChatAuth } from "@/components/(chat)/ChatAuthProvider";

type RoomEmptyStateProps = {
	title?: string;
	description: string;
	suggestions: Array<{ label: string; prompt: string }>;
	onSelectPrompt: (prompt: string) => void;
};

type DayPeriod = "morning" | "afternoon" | "evening";

function getDayPeriod(hour: number): DayPeriod {
	if (hour < 12) return "morning";
	if (hour < 18) return "afternoon";
	return "evening";
}

export function RoomEmptyState({
	title,
	description,
	suggestions,
	onSelectPrompt,
}: RoomEmptyStateProps) {
	const initialAuth = useInitialChatAuth();
	const t = useTranslations("Product.chat");
	const [period, setPeriod] = useState<DayPeriod>("morning");

	useEffect(() => {
		setPeriod(getDayPeriod(new Date().getHours()));
	}, []);

	const displayName = initialAuth?.user?.displayName?.trim();
	const firstName = displayName?.split(/\s+/)[0] || undefined;

	return (
		<div className="mx-auto flex min-h-[320px] w-full max-w-3xl flex-1 items-center justify-center px-5 py-10 sm:px-8">
			<section className="w-full max-w-2xl">
				<div className="text-center">
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
						{title ?? t("greeting", {
							period: t(period),
							name: firstName ? `, ${firstName}` : "",
						})}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">{description}</p>
				</div>

				<div className="mt-8 grid gap-2 sm:grid-cols-2">
					{suggestions.map((suggestion) => (
						<button
							key={suggestion.label}
							type="button"
							onClick={() => onSelectPrompt(suggestion.prompt)}
							className="group flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span>{suggestion.label}</span>
							<ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
						</button>
					))}
				</div>
			</section>
		</div>
	);
}
