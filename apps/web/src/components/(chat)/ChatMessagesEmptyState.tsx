"use client";

import { useEffect, useState } from "react";
import {
	BookOpenText,
	Code2,
	Lightbulb,
	PenLine,
	type LucideIcon,
} from "lucide-react";
import { useInitialChatAuth } from "@/components/(chat)/ChatAuthProvider";
import { useTranslations } from "next-intl";

type DayPeriod = "morning" | "afternoon" | "evening";

type PromptStarter = {
	key: string;
	icon: LucideIcon;
};

const PROMPT_STARTERS: Record<DayPeriod, PromptStarter[]> = {
	morning: [
		{ key: "planMyDay", icon: Lightbulb },
		{ key: "draftSomething", icon: PenLine },
		{ key: "learnATopic", icon: BookOpenText },
		{ key: "buildAnIdea", icon: Code2 },
	],
	afternoon: [
		{ key: "solveAProblem", icon: Lightbulb },
		{ key: "improveMyWriting", icon: PenLine },
		{ key: "explainAnything", icon: BookOpenText },
		{ key: "prototypeAnIdea", icon: Code2 },
	],
	evening: [
		{ key: "reflectOnToday", icon: Lightbulb },
		{ key: "writeCreatively", icon: PenLine },
		{ key: "exploreAQuestion", icon: BookOpenText },
		{ key: "makeSomething", icon: Code2 },
	],
};

function getDayPeriod(hour: number): DayPeriod {
	if (hour < 12) return "morning";
	if (hour < 18) return "afternoon";
	return "evening";
}
export function ChatMessagesEmptyState({
	onSelectPrompt,
	temporaryMode = false,
}: {
	onSelectPrompt: (prompt: string) => void;
	temporaryMode?: boolean;
}) {
	const initialAuth = useInitialChatAuth();
	const t = useTranslations("Product.chat");
	const [period, setPeriod] = useState<DayPeriod>("morning");

	useEffect(() => {
		setPeriod(getDayPeriod(new Date().getHours()));
	}, []);

	const displayName = initialAuth?.user?.displayName?.trim();
	const firstName = displayName?.split(/\s+/)[0] || undefined;
	const starters = PROMPT_STARTERS[period];

	return (
		<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
			<section className="mx-auto w-full max-w-2xl">
				<div className="text-center">
					{temporaryMode ? (
						<p className="mb-3 inline-flex items-center rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
							{t("temporary")}
						</p>
					) : null}
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
						{t("greeting", { period: t(period), name: firstName ? `, ${firstName}` : "" })}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{t("greetingPrompt")}
					</p>
				</div>

				<div className="mt-8 grid gap-2 sm:grid-cols-2">
					{starters.map((starter) => {
						const Icon = starter.icon;
						const label = t(`promptStarters.${starter.key}.label` as never);
						return (
							<button
								key={starter.key}
								type="button"
								onClick={() => onSelectPrompt(t(`promptStarters.${starter.key}.prompt` as never))}
								className="group flex min-h-12 items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
								<span>{label}</span>
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}
