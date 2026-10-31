"use client";

import * as React from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Sparkles, Tag } from "lucide-react";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import type { UsageLabelFacet } from "@/lib/fetchers/internal/settingsTypes";
import { cn } from "@/lib/utils";
import { usePrivateUsageQuery, usePrivateUsageRefresh } from "./PrivateUsageQuery";
import {
	buildLabelKeyOptions,
	CLASSIFIER_CALL_LABEL_KEY,
	formatUsd,
	type LabelKeyOption,
	type RequestClassifierSummary,
} from "./requestClassifierLabels";

export type UsageLabelBreakdownRow = {
	value: string;
	requests: number;
	successfulRequests: number;
	costNanos: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
};

type BreakdownResponse = { key: string; rows: UsageLabelBreakdownRow[]; workspaceId: string };

/**
 * One table row per value: the values used in the period, then any allowed
 * classifier values nobody has been labelled with yet, at zero.
 */
export function buildLabelBreakdownRows(option: LabelKeyOption | null, rows: UsageLabelBreakdownRow[]) {
	const labelFor = (value: string) => option?.values.find((entry) => entry.value === value)?.label ?? value;
	const used = rows.map((row) => ({ ...row, label: labelFor(row.value), used: true }));
	const usedValues = new Set(rows.map((row) => row.value));
	const unused = option && option.kind !== "caller"
		? option.values
			.filter((entry) => !usedValues.has(entry.value))
			.map((entry) => ({ value: entry.value, label: entry.label, requests: 0, successfulRequests: 0, costNanos: 0, tokens: 0, inputTokens: 0, outputTokens: 0, used: false }))
		: [];
	return [...used, ...unused];
}

export default function UsageLabelBreakdown({
	facets,
	classifiers,
	from,
	to,
	keyId,
	excludeKey,
	creatorId,
	labelFilterActive,
	scope: suppliedScope,
}: {
	facets: UsageLabelFacet[];
	classifiers: RequestClassifierSummary[];
	from: string;
	to: string;
	keyId?: string | null;
	excludeKey?: boolean;
	creatorId?: string | null;
	/** The label filter at the top applies to the rest of the page, not to this table. */
	labelFilterActive?: boolean;
	scope?: AccountQueryScope;
}) {
	const t = useTranslations("SettingsUI.requestClassifierUsage");
	const locale = useLocale();
	const refresh = usePrivateUsageRefresh();
	const scope = suppliedScope ?? refresh?.scope ?? { userId: null, workspaceId: null };
	const options = React.useMemo(() => buildLabelKeyOptions(facets, classifiers), [facets, classifiers]);
	const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
	const option = options.find((entry) => entry.key === selectedKey) ?? options[0] ?? null;
	const labelKey = option?.key ?? null;

	const query = usePrivateUsageQuery<BreakdownResponse>(
		scope as AccountQueryScope,
		"label-breakdown",
		{ label_key: labelKey ?? "", from, to, key: keyId ?? "", key_op: excludeKey ? "is_not" : "", user: creatorId ?? "" },
		false,
		async (signal) => {
			const params = new URLSearchParams({ workspaceId: scope.workspaceId!, label_key: labelKey!, from, to });
			if (keyId) params.set("key", keyId);
			if (keyId && excludeKey) params.set("key_op", "is_not");
			if (creatorId) params.set("user", creatorId);
			return fetchPrivateUsage<BreakdownResponse>(`/api/account/settings/usage/labels/breakdown?${params}`, scope as AccountQueryScope, signal);
		},
		Boolean(labelKey),
	);

	const numberFormat = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
	const percentFormat = React.useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }), [locale]);
	const optionName = (entry: LabelKeyOption) => entry.kind === "classifier_calls" ? t("classifierCalls") : entry.name ?? entry.key;
	const rows = buildLabelBreakdownRows(option, query.data?.key === labelKey ? query.data.rows : []);
	const totalCost = rows.reduce((total, row) => total + row.costNanos, 0);
	const totalRequests = rows.reduce((total, row) => total + row.requests, 0);
	const totalTokens = rows.reduce((total, row) => total + row.tokens, 0);
	const groups = [
		{ heading: t("classifierGroup"), options: options.filter((entry) => entry.kind === "classifier") },
		{ heading: t("classifierCallsGroup"), options: options.filter((entry) => entry.kind === "classifier_calls") },
		{ heading: t("callerGroup"), options: options.filter((entry) => entry.kind === "caller") },
	].filter((group) => group.options.length > 0);

	return (
		<section className="space-y-3 border-t pt-4" aria-labelledby="usage-label-breakdown-title">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 id="usage-label-breakdown-title" className="text-base font-semibold">{t("breakdownTitle")}</h2>
					<p className="text-sm text-muted-foreground">
						{option?.kind === "classifier_calls" ? t("classifierCallsNote") : t("breakdownDescription")}
					</p>
				</div>
				{options.length ? (
					<Select value={labelKey ?? undefined} onValueChange={(value: string) => setSelectedKey(value)}>
						<SelectTrigger className="h-8 w-56 rounded-md text-xs" aria-label={t("chooseKey")}>
							<span className="flex min-w-0 items-center gap-1.5">
								{option?.kind === "caller" ? <Tag className="size-3.5 shrink-0" /> : <Sparkles className="size-3.5 shrink-0" />}
								<span className="truncate">{option ? optionName(option) : t("chooseKey")}</span>
							</span>
						</SelectTrigger>
						<SelectContent align="end">
							{groups.map((group) => (
								<SelectGroup key={group.heading}>
									<SelectLabel>{group.heading}</SelectLabel>
									{group.options.map((entry) => (
										<SelectItem key={entry.key} value={entry.key}>
											<span className="truncate">{optionName(entry)}</span>
											{entry.kind === "classifier" && entry.classifierName ? (
												<span className="ml-2 truncate text-[11px] text-muted-foreground">{entry.classifierName}</span>
											) : null}
										</SelectItem>
									))}
								</SelectGroup>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
			{!options.length ? (
				<p className="text-sm text-muted-foreground">{t("noLabelKeys")}</p>
			) : query.isError ? (
				<p role="alert" className="text-sm text-muted-foreground">{t("loadFailed")}</p>
			) : (
				<div className="overflow-x-auto">
					<Table aria-busy={query.isPending}>
						<TableHeader>
							<TableRow>
								<TableHead>{option ? optionName(option) : t("value")}</TableHead>
								<TableHead className="text-right">{t("requests")}</TableHead>
								<TableHead className="text-right">{t("successRate")}</TableHead>
								<TableHead className="text-right">{t("tokens")}</TableHead>
								<TableHead className="text-right">{t("spend")}</TableHead>
								<TableHead className="w-[160px] text-right">{t("shareOfSpend")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{query.isPending ? (
								<TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">{t("loading")}</TableCell></TableRow>
							) : rows.length === 0 ? (
								<TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">{t("noRows")}</TableCell></TableRow>
							) : rows.map((row) => {
								const share = totalCost > 0 ? row.costNanos / totalCost : 0;
								return (
									<TableRow key={row.value} className={cn(!row.used && "text-muted-foreground")}>
										<TableCell className="max-w-[280px] truncate font-medium">
											<span title={row.label === row.value ? undefined : row.value}>{row.label}</span>
										</TableCell>
										<TableCell className="text-right font-mono">{numberFormat.format(row.requests)}</TableCell>
										<TableCell className="text-right font-mono">{row.requests > 0 ? percentFormat.format(row.successfulRequests / row.requests) : "-"}</TableCell>
										<TableCell className="text-right font-mono">{numberFormat.format(row.tokens)}</TableCell>
										<TableCell className="text-right font-mono">{formatUsd(row.costNanos)}</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-2">
												<div className="h-1.5 w-20 overflow-hidden rounded-sm bg-muted" aria-hidden>
													<div className="h-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
												</div>
												<span className="w-10 text-right font-mono text-xs">{percentFormat.format(share)}</span>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
						{!query.isPending && totalRequests > 0 ? (
							<TableFooter>
								<TableRow>
									<TableCell className="font-medium">{t("total")}</TableCell>
									<TableCell className="text-right font-mono">{numberFormat.format(totalRequests)}</TableCell>
									<TableCell />
									<TableCell className="text-right font-mono">{numberFormat.format(totalTokens)}</TableCell>
									<TableCell className="text-right font-mono">{formatUsd(totalCost)}</TableCell>
									<TableCell />
								</TableRow>
							</TableFooter>
						) : null}
					</Table>
				</div>
			)}
			{options.length ? (
				<p className="text-xs text-muted-foreground">
					{option?.key === CLASSIFIER_CALL_LABEL_KEY || !option ? null : `${t("multiValueNote")} `}
					{labelFilterActive ? t("notFilteredByLabel") : null}
				</p>
			) : null}
		</section>
	);
}
