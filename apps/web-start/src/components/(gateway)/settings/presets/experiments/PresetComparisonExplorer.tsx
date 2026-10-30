"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

export function PresetComparisonExplorer({
	children,
	initialQuery = "",
}: {
	children: ReactNode;
	initialQuery?: string;
}) {
	const t = useTranslations("SettingsUI");
	const [query, setQuery] = useState(initialQuery);
	const [visibleCount, setVisibleCount] = useState<number | null>(null);
	const resultsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const normalized = query.trim().toLowerCase();
		const rows = resultsRef.current?.querySelectorAll<HTMLElement>("[data-preset-search]") ?? [];
		let nextVisibleCount = 0;
		for (const row of rows) {
			row.hidden = Boolean(normalized) && !row.dataset.presetSearch?.includes(normalized);
			if (!row.hidden) nextVisibleCount += 1;
		}
		setVisibleCount(nextVisibleCount);
	}, [query]);

	return (
		<div className="space-y-3">
			<div className="relative w-full lg:w-72">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("strings.Search presets" as never)}
					aria-label={t("strings.Search presets" as never)}
					className="!rounded-md pr-8 pl-8"
				/>
				{query ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-md"
						onClick={() => setQuery("")}
						aria-label={t("strings.Clear preset search" as never)}
					>
						<X className="size-4" />
					</Button>
				) : null}
			</div>
			<div ref={resultsRef}>{children}</div>
			{query && visibleCount === 0 ? (
				<p className="py-4 text-sm text-muted-foreground">{t("strings.No presets match" as never)} “{query}”.</p>
			) : null}
		</div>
	);
}
