"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Scale } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const compareParser = parseAsBoolean.withDefault(false).withOptions({
	history: "push",
});

export function PricingComparisonShell({ children }: { children: ReactNode }) {
	const t = useTranslations("Site.pricing");
	const [compare, setCompare] = useQueryState("compare", compareParser);

	return (
		<div>
			<div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
						{t("everythingIncluded")}
					</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{t("everythingIncludedBody")}
					</p>
					<p className="mt-3 text-xs font-medium text-foreground sm:hidden">
						{t("swipeCompare")}
					</p>
				</div>
				<Link
					href={compare ? "/pricing" : "/pricing?compare=true"}
					role="button"
					aria-pressed={compare}
					onClick={async (event) => {
						event.preventDefault();
						await setCompare(compare ? null : true);
					}}
					className={cn(
						"inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted",
						compare && "bg-muted",
					)}
				>
					<Scale className="h-4 w-4" aria-hidden="true" />
					{compare ? t("showFreeAccess") : t("compareCompetitors")}
				</Link>
			</div>

			<ScrollArea
				scrollBarOrientation="horizontal"
				keepScrollbarMounted
				viewportClassName="pb-2"
				className={cn(
					"w-full rounded-xl border border-zinc-200/70 bg-white/75 [&>[data-orientation=horizontal]]:opacity-100 [&>[data-orientation=horizontal]]:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60",
					compare && "[&_.best-cell]:bg-zinc-50/45 [&_.competitor-cell]:table-cell [&_.competitor-col]:table-column [&_.enterprise-column]:hidden [&_.feature-column]:w-[20%] [&_.free-column]:hidden [&_.phaseo-column]:w-[16%] [&_.phaseo-default]:hidden [&_.phaseo-compare]:inline [&_table]:min-w-[1480px] dark:[&_.best-cell]:bg-white/[0.012]",
				)}
			>
				{children}
			</ScrollArea>

			{compare ? (
				<p className="mt-3 text-xs leading-5 text-muted-foreground">
					{t("competitorNote")}
				</p>
			) : null}
		</div>
	);
}
