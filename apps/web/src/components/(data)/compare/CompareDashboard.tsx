"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { decodeModelIdFromUrl, encodeModelIdForUrl } from "./compareUrl";
import type { CompareModelOption } from "./types";
import { CompareEmptyState } from "./view/CompareEmptyState";
import { CompareView } from "./view/CompareView";
import type { CompareView as CompareViewData, CompareViewUsageByModel } from "./view/types";

type CompareDashboardProps = {
	/** Options for the selected models. Pickers load the full list from the web API when opened. */
	selectedOptions: CompareModelOption[];
	view: CompareViewData;
	usage: CompareViewUsageByModel;
};

export default function CompareDashboard({ selectedOptions, view, usage }: CompareDashboardProps) {
	const t = useTranslations("Catalogue.compareView");
	const params = useSearchParams();
	const searchParams = useMemo(() => params ?? new URLSearchParams(), [params]);
	const router = useRouter();
	const selectedIds = useMemo(
		() => [...new Set(searchParams.getAll("models").map(decodeModelIdFromUrl).filter(Boolean))],
		[searchParams],
	);

	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		const query = params.toString();
		router.replace(query ? `?${query}` : "/compare", { scroll: false });
	};

	const modelsById = new Map(view.models.map((model) => [model.id, model]));
	const ordered = selectedIds.flatMap((id) => {
		const model = modelsById.get(id);
		return model ? [model] : [];
	});
	const missing = selectedIds.filter((id) => !modelsById.has(id));

	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
			{missing.length ? (
				<div role="status" className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
					<p className="font-medium">{t("notFound", { count: missing.length })}</p>
					<p className="mt-1 font-mono text-xs text-muted-foreground">{missing.join(", ")}</p>
				</div>
			) : null}
			{ordered.length ? (
				<CompareView
					view={{ ...view, models: ordered }}
					usage={usage}
					selectedOptions={selectedOptions}
					selectedIds={ordered.map((model) => model.id)}
					onSelectedIdsChange={setSelected}
				/>
			) : (
				<CompareEmptyState selectedOptions={selectedOptions} onSelect={setSelected} />
			)}
		</div>
	);
}
