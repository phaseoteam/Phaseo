"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Globe2 } from "lucide-react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type GeographyRow = {
	countryCode: string;
	requests: number;
	tokens: number;
	sharePercent?: number;
	spendNanos?: number;
	successes?: number;
	averageLatencyMs?: number | null;
};

function countryName(code: string, locale: string) {
	if (code === "OTHER") return "Other";
	try {
		return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
	} catch {
		return code;
	}
}

function successRate(row: GeographyRow) {
	if (row.requests <= 0 || row.successes == null) return null;
	return (row.successes / row.requests) * 100;
}

function requestShare(row: GeographyRow, totalRequests: number) {
	if (row.sharePercent != null) return row.sharePercent;
	if (totalRequests <= 0) return 0;
	return (row.requests / totalRequests) * 100;
}

function CountryMark({ code }: { code: string }) {
	const isCountry = /^[A-Z]{2}$/.test(code);
	return (
		<span className="relative flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
			{isCountry ? (
				<Image src={`/flags/${code.toLowerCase()}.svg`} alt="" fill className="object-cover" />
			) : (
				<Globe2 className="size-4 text-muted-foreground" />
			)}
		</span>
	);
}

export function GeographyUsage({
	rows,
	publicView = false,
}: {
	rows: GeographyRow[];
	publicView?: boolean;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const format = useDisplayFormatters();
	const compact = (value: number) =>
		format.number(value, { notation: "compact", maximumFractionDigits: 1 });
	const formatPercent = (value: number) =>
		`${format.number(value, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
			notation: "standard",
		})}%`;
	const formatSpend = (value: number | undefined) =>
		format.number((value ?? 0) / 1e9, {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 4,
			notation: "standard",
		});
	const formatLatency = (value: number | null | undefined) =>
		value == null
			? "—"
			: `${format.number(Math.round(value), {
					maximumFractionDigits: 0,
					notation: "standard",
				})} ms`;
	const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
	if (publicView) {
		if (rows.length === 0) {
			return (
				<p className="border-y border-border py-8 text-sm text-muted-foreground">
					{t("strings.phraseCountryUsageWillAppearAfterGatewayRequestsIncludeSufficientGeographicMetadata" as never)}
				</p>
			);
		}

		const split = Math.ceil(rows.length / 2);
		const columns = [rows.slice(0, split), rows.slice(split)].filter((column) => column.length);
		return (
			<div className="grid gap-x-16 gap-y-1 border-y border-border py-4 md:grid-cols-2">
				{columns.map((column, columnIndex) => (
					<div key={`country-column-${columnIndex}`} className="space-y-1">
						{column.map((row, rowIndex) => {
							const position = columnIndex * split + rowIndex + 1;
							const isCountry = /^[A-Z]{2}$/.test(row.countryCode);
							const content = (
								<>
									<span className="relative flex h-6 w-8 items-center justify-center overflow-hidden rounded-md border bg-background">
										{isCountry ? (
											<Image src={`/flags/${row.countryCode.toLowerCase()}.svg`} alt="" fill className="object-cover" />
										) : (
											<Globe2 className="size-4 text-muted-foreground" />
										)}
									</span>
									<div className="min-w-0">
										<p className="truncate font-semibold underline decoration-transparent underline-offset-2 group-hover:decoration-current">
											{countryName(row.countryCode, locale)}
										</p>
										<p className="text-xs text-muted-foreground">{compact(row.requests)} {t("strings.requests" as never)}</p>
									</div>
									<div className="text-right">
										<p className="font-medium tabular-nums">{compact(row.tokens)} {t("strings.tokens" as never)}</p>
										<p className="text-xs tabular-nums text-muted-foreground">{formatPercent(row.sharePercent ?? 0)}</p>
									</div>
								</>
							);
							return (
								<div key={row.countryCode} className="grid min-h-14 grid-cols-[2rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5">
									<span className="tabular-nums text-muted-foreground">{position}.</span>
									{isCountry ? (
										<Link href={`/countries/${row.countryCode.toLowerCase()}`} className="group contents">
											{content}
										</Link>
									) : content}
								</div>
							);
						})}
					</div>
				))}
			</div>
		);
	}

	return (
		rows.length === 0 ? (
			<div className="rounded-lg border border-dashed px-4 py-8">
					<p className="text-sm font-medium">{t("strings.No geographic usage yet" as never)}</p>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("strings.phraseCountriesWillAppearAfterRequestsInTheSelectedPeriodIncludeGeographicMetadata" as never)}
				</p>
			</div>
		) : (
			<>
				<div className="space-y-3 md:hidden">
					{rows.map((row) => {
						const rate = successRate(row);
						const share = requestShare(row, totalRequests);
						return (
							<div key={row.countryCode} className="rounded-lg border bg-card px-4 py-3">
								<div className="flex items-center gap-3">
									<CountryMark code={row.countryCode} />
									<div className="min-w-0">
								<p className="truncate font-medium">{countryName(row.countryCode, locale)}</p>
										<p className="text-xs text-muted-foreground">{row.countryCode}</p>
									</div>
								</div>
								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-sm">
									<div>
										<dt className="text-muted-foreground">{t("strings.Requests" as never)}</dt>
										<dd className="font-medium tabular-nums">{compact(row.requests)}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">{t("strings.Share" as never)}</dt>
										<dd className="font-medium tabular-nums">{formatPercent(share)}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">{t("strings.Tokens" as never)}</dt>
										<dd className="font-medium tabular-nums">{compact(row.tokens)}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">{t("strings.Success" as never)}</dt>
										<dd className="font-medium tabular-nums">{rate == null ? "—" : formatPercent(rate)}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">{t("strings.Spend" as never)}</dt>
										<dd className="font-medium tabular-nums">{formatSpend(row.spendNanos)}</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">{t("strings.Average latency" as never)}</dt>
										<dd className="font-medium tabular-nums">{formatLatency(row.averageLatencyMs)}</dd>
									</div>
								</dl>
							</div>
						);
					})}
				</div>

				<div className="hidden overflow-hidden rounded-lg border md:block">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-4">{t("strings.Country" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Requests" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Share" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Tokens" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Success" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Spend" as never)}</TableHead>
								<TableHead className="px-4 text-right">{t("strings.Average latency" as never)}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const rate = successRate(row);
								const share = requestShare(row, totalRequests);
								return (
									<TableRow key={row.countryCode}>
										<TableCell className="px-4 py-3">
											<div className="flex items-center gap-3">
												<CountryMark code={row.countryCode} />
												<div className="min-w-0">
													<p className="truncate font-medium">{countryName(row.countryCode, locale)}</p>
													<p className="text-xs text-muted-foreground">{row.countryCode}</p>
												</div>
											</div>
										</TableCell>
										<TableCell className="text-right font-medium tabular-nums">
											{compact(row.requests)}
										</TableCell>
										<TableCell className="text-right tabular-nums">{formatPercent(share)}</TableCell>
										<TableCell className="text-right tabular-nums">{compact(row.tokens)}</TableCell>
										<TableCell className="text-right tabular-nums">
											{rate == null ? "—" : formatPercent(rate)}
										</TableCell>
										<TableCell className="text-right tabular-nums">{formatSpend(row.spendNanos)}</TableCell>
										<TableCell className="px-4 text-right tabular-nums">
											{formatLatency(row.averageLatencyMs)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</>
		)
	);
}
