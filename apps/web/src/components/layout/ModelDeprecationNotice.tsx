"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import type { DeprecationWarning } from "@/lib/fetchers/usage/types";
import { deprecationNoticeKey, fillNoticeTemplate as fill, visibleDeprecationWarnings } from "./deprecationNoticeState";

const REFRESH_MS = 6 * 60 * 60 * 1000;

export type ModelDeprecationNoticeCopy = {
	oneModel: string;
	manyModels: string;
	retiresOn: string;
	replacement: string;
	review: string;
	dismiss: string;
};

type CachedWarnings = { fetchedAt: number; warnings: DeprecationWarning[] };

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
	const [warnings, setWarnings] = useState<DeprecationWarning[]>([]);
	// Nothing renders until warnings load after hydration, so reading storage
	// here cannot cause a hydration mismatch.
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() =>
		typeof window === "undefined" ? new Set() : new Set(readStorage<string[]>(dismissedKey) ?? []));

	useEffect(() => {
		// Signed-in page views reuse the last answer for a few hours instead of
		// querying usage on every navigation.
		const cached = readStorage<CachedWarnings>(cacheKey);
		const controller = new AbortController();
		const load = cached && Date.now() - cached.fetchedAt < REFRESH_MS
			? Promise.resolve(cached.warnings)
			: fetchPrivateUsage<SettingsUsageAlertsInitialData>(
				`/api/account/settings/usage/alerts?workspaceId=${encodeURIComponent(workspaceId)}`,
				{ userId, workspaceId },
				controller.signal,
			).then((data) => {
				if (data.workspaceId !== workspaceId) return [];
				const alerts = data.warnings.filter((warning) => warning.countAsAlert);
				writeStorage(cacheKey, { fetchedAt: Date.now(), warnings: alerts } satisfies CachedWarnings);
				return alerts;
			});
		load.then((next) => {
			if (!controller.signal.aborted) setWarnings(next);
		}).catch(() => {
			// The notice is advisory; the alerts page shows the same data with errors.
		});
		return () => controller.abort();
	}, [cacheKey, userId, workspaceId]);

	const visible = visibleDeprecationWarnings(warnings, dismissed);
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

	return (
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
	);
}
