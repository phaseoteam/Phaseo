import * as React from "react";
import { useTranslations } from "@/i18n/react";
import Link from "@/components/link";
import { TimestampHoverCard } from "@/components/display/TimestampHoverCard";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Badge } from "@/components/ui/badge";
import { joinMeta } from "@/components/ui/hover-card";
import { useRelativeNow } from "@/hooks/useRelativeNow";
import type { DeprecationWarning } from "@/lib/fetchers/usage/types";
import { cn } from "@/lib/utils";

function daysUntilRetirement(date: Date) {
	const dayMs = 24 * 60 * 60 * 1000;
	return Math.ceil((date.getTime() - Date.now()) / dayMs);
}

function retirementToneClassName(daysUntil: number) {
	if (daysUntil < 0) {
		return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
	}
	if (daysUntil <= 7) {
		return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
	}
	if (daysUntil <= 14) {
		return "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300";
	}
	if (daysUntil <= 30) {
		return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
	}
	if (daysUntil <= 60) {
		return "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300";
	}
	return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300";
}

function modelHref(modelId: string): string | null {
	const [organisationId, ...rest] = modelId.split("/");
	if (!organisationId || rest.length === 0) return null;
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(rest.join("/"))}`;
}

export default function RetiresBadge(props: {
	label: string;
	row: DeprecationWarning;
	className?: string;
}) {
	const { label, row, className } = props;
	const t = useTranslations("Common.ui.hoverCards");
	const format = useDisplayFormatters();
	const nowMs = useRelativeNow();
	const parsed = row.retirementDate ? new Date(row.retirementDate) : null;
	const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

	if (!valid) {
		return (
			<Badge variant="outline" className={className}>
				<span className="font-semibold">{label}</span>
			</Badge>
		);
	}

	const daysUntil = daysUntilRetirement(valid);
	const replacementHref = row.replacementModelId ? modelHref(row.replacementModelId) : null;

	return (
		<TimestampHoverCard
			variant="date"
			value={valid}
			asChild
			title={t("retires", { date: format.date(valid) })}
			meta={joinMeta([
				nowMs === null ? null : format.relative(valid, new Date(nowMs), "day"),
				row.deprecationDate
					? t("deprecatedOn", { date: format.date(row.deprecationDate) })
					: null,
			])}
			extraRows={[
				row.lastUsedAt
					? { key: "last-used", label: t("lastUsed"), value: format.dateTime(row.lastUsedAt) }
					: null,
				row.replacementModelId
					? {
							key: "replacement",
							label: t("replacement"),
							value: replacementHref ? (
								<Link
									href={replacementHref}
									className="break-all font-mono text-[11px] text-foreground underline underline-offset-2 hover:decoration-foreground"
								>
									{row.replacementModelId}
								</Link>
							) : (
								<code className="break-all font-mono text-[11px]">{row.replacementModelId}</code>
							),
						}
					: null,
			]}
		>
			<Badge
				variant="outline"
				className={cn("cursor-help", className, retirementToneClassName(daysUntil))}
				render={<button type="button" />}
			>
				<span className="font-semibold">{label}</span>
			</Badge>
		</TimestampHoverCard>
	);
}
