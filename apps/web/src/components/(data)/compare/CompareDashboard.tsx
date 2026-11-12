import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation";
import { useTranslations } from "@/i18n/react";
import type { ComparePairLink } from "./ComparePairSummary";
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
	/** Curated head-to-head pages, listed when nothing is selected. */
	pairs?: ComparePairLink[];
};

/** `/compare?models=…`: the selection lives in the query string. */
export default function CompareDashboard(props: CompareDashboardProps) {
	const params = useSearchParams();
	const searchParams = useMemo(() => params ?? new URLSearchParams(), [params]);
	const router = useRouter();
	const pathname = usePathname();
	const selectedIds = useMemo(
		// The page fetches at most four, so ids past that are neither shown nor reported missing.
		() => [...new Set(searchParams.getAll("models").map(decodeModelIdFromUrl).filter(Boolean))].slice(0, 4),
		[searchParams],
	);
	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		const query = params.toString();
		router.replace(query ? `?${query}` : pathname, { scroll: false });
	};
	return <CompareDashboardBody {...props} selectedIds={selectedIds} onSelect={setSelected} />;
}

/**
 * `/compare/a-vs-b`: the two models come from the path. It doesn't read the
 * query string, so the page can be cached per URL; changing the selection
 * opens the general compare page.
 */
export function ComparePairDashboard({ ids, ...props }: CompareDashboardProps & { ids: string[] }) {
	const router = useRouter();
	const pathname = usePathname();
	const setSelected = (next: string[]) => {
		// "/de-DE/compare/a-vs-b" becomes "/de-DE/compare?models=…".
		const base = pathname.slice(0, pathname.lastIndexOf("/"));
		const query = next.map((id) => `models=${encodeURIComponent(encodeModelIdForUrl(id))}`).join("&");
		router.push(query ? `${base}?${query}` : base);
	};
	return <CompareDashboardBody {...props} selectedIds={ids} onSelect={setSelected} />;
}

function CompareDashboardBody({
	selectedOptions,
	view,
	usage,
	pairs = [],
	selectedIds,
	onSelect,
}: CompareDashboardProps & { selectedIds: string[]; onSelect: (ids: string[]) => void }) {
	const t = useTranslations("Catalogue.compareView");
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
					onSelectedIdsChange={onSelect}
				/>
			) : (
				<CompareEmptyState selectedOptions={selectedOptions} onSelect={onSelect} pairs={pairs} />
			)}
		</div>
	);
}
