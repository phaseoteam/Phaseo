"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import {
	DEPRECATION_NOTICE_REFRESH_MS,
	deprecationNoticeKey,
	deprecationNoticeRefreshDelay,
	deprecationNoticeStaleIn,
	fillNoticeTemplate as fill,
	isCachedDeprecationNoticeFresh,
	visibleDeprecationWarnings,
	type CachedDeprecationWarnings,
} from "./deprecationNoticeState";
import { useNoticeStackHeight } from "./useNoticeStackHeight";

export type ModelDeprecationNoticeCopy = {
	oneModel: string;
	manyModels: string;
	retiresOn: string;
	replacement: string;
	review: string;
	dismiss: string;
};

function readStorage<T>(key: string): T | null {
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: unknown) {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage can be full or disabled; the notice still works for this page.
	}
}

export default function ModelDeprecationNotice({ userId, workspaceId, locale, copy }: {
	userId: string;
	workspaceId: string;
	locale: string;
	copy: ModelDeprecationNoticeCopy;
}) {
	const cacheKey = `phaseo:model-deprecation-notice:${userId}:${workspaceId}`;
	const dismissedKey = `phaseo:model-deprecation-notice:dismissed:${workspaceId}`;
	// Nothing renders until warnings load after hydration, so reading storage
	// here cannot cause a hydration mismatch.
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() =>
		typeof window === "undefined" ? new Set() : new Set(readStorage<string[]>(dismissedKey) ?? []));

	// Freshness follows when the warnings were fetched (possibly on an earlier
	// page load), so long-lived sessions refetch at expiry and on focus.
	const { data } = useQuery({
		...WEB_QUERY_POLICIES.private,
		queryKey: [...webQueryKeys.account.scope({ userId, workspaceId }), "deprecation-notice"] as const,
		queryFn: async ({ signal }): Promise<CachedDeprecationWarnings> => {
			const cached = readStorage<CachedDeprecationWarnings>(cacheKey);
			if (isCachedDeprecationNoticeFresh(cached, Date.now())) return cached;
			const response = await fetchPrivateUsage<SettingsUsageAlertsInitialData>(
				`/api/account/settings/usage/alerts?workspaceId=${encodeURIComponent(workspaceId)}`,
				{ userId, workspaceId },
				signal,
			);
			const fetchedAt = Date.now();
			if (response.workspaceId !== workspaceId) return { fetchedAt, warnings: [] };
			const next = { fetchedAt, warnings: response.warnings.filter((warning) => warning.countAsAlert) };
			writeStorage(cacheKey, next);
			return next;
		},
		staleTime: (query) => deprecationNoticeStaleIn(query.state.data, Date.now()),
		gcTime: DEPRECATION_NOTICE_REFRESH_MS,
		refetchInterval: (query) => query.state.data ? deprecationNoticeRefreshDelay(query.state.data, Date.now()) : false,
	});
	const visible = visibleDeprecationWarnings(data?.warnings ?? [], dismissed);
	const barRef = useNoticeStackHeight("deprecation");
	if (!visible.length) return null;

	const first = visible[0]!;
	const formatDate = (value: string) => {
		const date = new Date(value);
		return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date) : value;
	};
	const parts = visible.length === 1
		? [
			fill(copy.oneModel, { model: first.modelName ?? first.modelId }),
			first.retirementDate ? fill(copy.retiresOn, { date: formatDate(first.retirementDate) }) : null,
			first.replacementModelId ? fill(copy.replacement, { replacement: first.replacementModelId }) : null,
		]
		: [fill(copy.manyModels, { count: String(visible.length) })];
	const critical = visible.some((warning) => warning.severity === "critical");

	function dismiss() {
		const next = new Set(dismissed);
		for (const warning of visible) next.add(deprecationNoticeKey(warning));
		setDismissed(next);
		writeStorage(dismissedKey, [...next]);
	}

	// Fixed below the site notice and measured into `--site-notice-height`, so
	// the header, chat root and settings sidebar all start below it.
	return (
		<>
			<div ref={barRef} className="fixed inset-x-0 top-[var(--deprecation-notice-top,0px)] z-[60] bg-background">
				<div
					role="status"
					className={critical
						? "border-b border-red-300 bg-red-100/95 text-red-950 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100"
						: "border-b border-amber-300 bg-amber-100/95 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100"}
				>
					<div className="mx-auto flex w-full max-w-[1280px] items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8 lg:text-sm">
						<TriangleAlert aria-hidden className="size-4 shrink-0" />
						<p className="min-w-0 flex-1">
							{parts.filter(Boolean).join(" ")}{" "}
							<Link href="/settings/usage/alerts" className="whitespace-nowrap font-semibold underline underline-offset-4">
								{copy.review}
							</Link>
						</p>
						<button
							type="button"
							onClick={dismiss}
							aria-label={copy.dismiss}
							className="grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-white/10"
						>
							<X aria-hidden className="size-4" />
						</button>
					</div>
				</div>
			</div>
			{/* Holds the bar's place in the flow so the sticky header starts below it. */}
			<div aria-hidden style={{ height: "var(--deprecation-notice-bar-height, 0px)" }} />
		</>
	);
}
