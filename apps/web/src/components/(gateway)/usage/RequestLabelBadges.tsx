import Link from "@/components/link";
import { useSearchParams } from "@/lib/navigation";
import { useTranslations } from "@/i18n/react";

import { readRequestLabels } from "./RequestClassificationsSection";
import {
	CLASSIFIER_CALL_LABEL_KEY,
	classifierDimensionsByKey,
	classifierNameById,
	labelFilterHref,
	type RequestClassifierSummary,
} from "./requestClassifierLabels";

const BADGE_CLASS = "inline-flex min-w-0 max-w-[13rem] items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4 text-foreground transition-colors hover:border-border hover:bg-muted";

/**
 * A request's labels as small badges for the logs table: classifier answers
 * show their dimension's name, classifier calls say so. Each badge filters
 * the logs to that value; labels past `max` collapse into a count.
 */
export default function RequestLabelBadges({
	labels,
	classifiers = [],
	max = 2,
}: {
	labels: unknown;
	classifiers?: RequestClassifierSummary[];
	max?: number;
}) {
	const t = useTranslations("SettingsUI.requestClassifierUsage");
	const searchParams = useSearchParams();
	const all = readRequestLabels({ labels });
	if (!all.length) return <span className="text-xs text-muted-foreground">—</span>;

	const dimensions = classifierDimensionsByKey(classifiers);
	const names = classifierNameById(classifiers);
	const describe = (key: string, value: string) => {
		if (key === CLASSIFIER_CALL_LABEL_KEY) return { name: null, text: t("classifierCallBadge"), title: t("thisIsClassifierCall", { name: names.get(value) ?? value }) };
		const name = dimensions.get(key)?.dimension.name ?? key;
		return { name, text: value, title: t("showLabelled", { key: name, value }) };
	};
	const shown = all.slice(0, max);
	const hidden = all.slice(max);

	return (
		<span className="flex min-w-0 flex-wrap items-center gap-1">
			{shown.map(({ key, value }) => {
				const badge = describe(key, value);
				return (
					<Link key={`${key}\u0000${value}`} href={labelFilterHref(key, value, searchParams)} className={BADGE_CLASS} title={badge.title}>
						{badge.name ? <span className="shrink-0 text-muted-foreground">{badge.name}</span> : null}
						<span className="min-w-0 truncate font-medium">{badge.text}</span>
					</Link>
				);
			})}
			{hidden.length ? (
				<span
					className="rounded-md px-1 text-[11px] leading-4 text-muted-foreground"
					title={hidden.map(({ key, value }) => {
						const badge = describe(key, value);
						return badge.name ? `${badge.name}: ${badge.text}` : badge.text;
					}).join("\n")}
				>
					{t("moreLabels", { count: hidden.length })}
				</span>
			) : null}
		</span>
	);
}
