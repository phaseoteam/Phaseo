"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { spendRuleHistory } from "@/app/(dashboard)/settings/notifications/spend-rules-actions";
import { useSpendPercent, useSpendUsd } from "./spendAlertsUi";
import type { SpendRule, SpendRuleHistory } from "./spendRules";

const PAGE = 20;

/** Alerts a rule has sent (newest first) and its recent periods, a page at a time. */
export function SpendRuleHistorySheet({ rule, onClose }: { rule: SpendRule | null; onClose: () => void }) {
	return (
		<ProviderInspectorSheet open={rule !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[42vw] lg:!w-[38vw] xl:!w-[34vw] data-[side=right]:sm:max-w-none">
				{rule ? <HistoryBody key={rule.id} rule={rule} /> : null}
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	);
}

type State = { status: "loading" } | { status: "failed" } | { status: "ready"; history: SpendRuleHistory; loadingMore: boolean };

function HistoryBody({ rule }: { rule: SpendRule }) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const format = useDisplayFormatters();
	const usd = useSpendUsd();
	const percentText = useSpendPercent();
	const [state, setState] = useState<State>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		void spendRuleHistory(rule.id, { limit: PAGE, offset: 0 }).then((result) => {
			if (cancelled) return;
			setState(result.ok ? { status: "ready", history: result.history, loadingMore: false } : { status: "failed" });
		});
		return () => { cancelled = true; };
	}, [rule.id, attempt]);

	async function loadMore() {
		if (state.status !== "ready") return;
		setState({ ...state, loadingMore: true });
		const result = await spendRuleHistory(rule.id, { limit: PAGE, offset: state.history.events.length });
		if (!result.ok) {
			setState({ ...state, loadingMore: false });
			return;
		}
		setState({
			status: "ready",
			loadingMore: false,
			history: { events: [...state.history.events, ...result.history.events], has_more: result.history.has_more, periods: state.history.periods },
		});
	}

	const when = (value: string) => format.dateParts(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

	return (
		<>
			<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
				<ProviderInspectorSheetTitle className="truncate text-base">{t("history.title", { name: rule.name })}</ProviderInspectorSheetTitle>
				<ProviderInspectorSheetDescription className="mt-1">{t("history.description")}</ProviderInspectorSheetDescription>
			</ProviderInspectorSheetHeader>
			<ScrollArea className="min-h-0 flex-1 overscroll-contain" viewportClassName="pb-6 overscroll-contain">
				<div className="space-y-6 px-5 py-5">
					{state.status === "loading" ? <p className="text-sm text-muted-foreground">{t("history.loading")}</p> : null}
					{state.status === "failed" ? (
						<div role="alert" className="space-y-2">
							<p className="text-sm text-muted-foreground">{t("history.failed")}</p>
							<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>{t("history.retry")}</Button>
						</div>
					) : null}
					{state.status === "ready" ? (
						<>
							<section className="space-y-2">
								<h3 className="text-sm font-medium">{t("history.events")}</h3>
								{state.history.events.length === 0 ? (
									<p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">{t("history.none")}</p>
								) : (
									<ul className="divide-y rounded-md border">
										{state.history.events.map((event) => (
											<li key={event.id} className="space-y-1 px-3 py-3">
												<div className="flex flex-wrap items-center justify-between gap-2">
													<span className="flex items-center gap-2 text-sm font-medium">
														<Badge variant={event.kind === "spend_blocked" ? "destructive" : "outline"} className="rounded-md">
															{event.kind === "spend_blocked" ? (event.state === "lifted" ? t("history.kindLifted") : t("history.kindBlocked")) : t("history.kindAlert")}
														</Badge>
														{event.threshold_percent !== null ? <span className="tabular-nums">{event.threshold_percent}%</span> : null}
													</span>
													<span className="text-xs tabular-nums text-muted-foreground">{when(event.created_at)}</span>
												</div>
												{event.title ? <p className="text-sm">{event.title}</p> : null}
												<p className="text-xs tabular-nums text-muted-foreground">
													{[
														event.value_usd !== null ? (event.base_usd !== null
															? t("history.valueOfBase", { value: usd(event.value_usd), base: usd(event.base_usd), percent: percentText(event.percent ?? (event.value_usd / event.base_usd) * 100) })
															: t("history.value", { value: usd(event.value_usd) })) : null,
														t("history.deliveries", { sent: event.deliveries.sent, failed: event.deliveries.failed, pending: event.deliveries.pending }),
													].filter(Boolean).join(" · ")}
												</p>
											</li>
										))}
									</ul>
								)}
								{state.history.has_more ? (
									<Button type="button" variant="outline" size="sm" className="rounded-md" disabled={state.loadingMore} onClick={() => void loadMore()}>
										{state.loadingMore ? t("history.loading") : t("history.more")}
									</Button>
								) : null}
							</section>
							{state.history.periods.length ? (
								<section className="space-y-2">
									<h3 className="text-sm font-medium">{t("history.periods")}</h3>
									<ul className="divide-y rounded-md border">
										{state.history.periods.map((period) => (
											<li key={`${period.period_start}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-xs tabular-nums">
												<span className="text-sm">{period.period_start && Number.isFinite(Date.parse(period.period_start)) ? t("history.periodFrom", { date: when(period.period_start) }) : t("history.rolling")}</span>
												<span className="text-muted-foreground">
													{period.fire_count === 0
														? t("history.periodQuiet")
														: period.highest_percent_fired !== null
															? t("history.periodFiredHighest", { count: period.fire_count, highest: period.highest_percent_fired })
															: t("history.periodFired", { count: period.fire_count })}
												</span>
											</li>
										))}
									</ul>
								</section>
							) : null}
							<p className="text-xs text-muted-foreground">{t("history.testsNote")}</p>
						</>
					) : null}
				</div>
			</ScrollArea>
		</>
	);
}
