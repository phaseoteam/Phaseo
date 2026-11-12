import type { ReactNode } from "react";
import { useTranslations } from "@/i18n/react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { SettingsSpendRuleOptions } from "@/lib/fetchers/internal/settingsTypes";
import { cn } from "@/lib/utils";
import type { SpendRuleScope } from "./spendRules";

/** USD the way the budgets and key pages show it: $12.50, with four places below a cent. */
export function useSpendUsd() {
	const format = useDisplayFormatters();
	return (value: number) => format.number(value, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
		notation: "standard",
	});
}

export function useSpendPercent() {
	const format = useDisplayFormatters();
	return (percent: number) => format.number(percent / 100, { style: "percent", maximumFractionDigits: percent < 10 ? 1 : 0 });
}

/** A balance rule's preview: "Balance $42.10, spending $6.00 a day: about 7 days left". */
export function useBalanceSummary() {
	const t = useTranslations("SettingsUI.spendAlerts");
	const usd = useSpendUsd();
	const format = useDisplayFormatters();
	const days = (value: number) => format.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 });
	return {
		text: (summary: { availableUsd: number; burnPerDayUsd: number; runwayDays: number | null; windowHours: number }) => summary.runwayDays === null
			? t("preview.balanceNoSpend", { balance: usd(summary.availableUsd), hours: summary.windowHours })
			: t("preview.balance", { balance: usd(summary.availableUsd), burn: usd(summary.burnPerDayUsd), days: days(summary.runwayDays) }),
		runway: (runwayDays: number | null) => (runwayDays === null ? null : t("row.runway", { days: days(runwayDays) })),
	};
}

type ForecastSummary =
	| { kind: "forecast"; valueUsd: number; projectedUsd: number; by: string; reachesAt: string | null; limitUsd: number | null; timeZone: string }
	| { kind: "forecastPending"; valueUsd: number; from: string | null; timeZone: string };

/**
 * A forecast rule's preview: "Spent $200 so far, projected $620 by 1 Nov, 00:00; at this pace
 * it reaches $500 on 26 Oct, 00:00", with times in the rule's zone (the period is the rule's).
 */
export function useForecastSummary() {
	const t = useTranslations("SettingsUI.spendAlerts");
	const usd = useSpendUsd();
	const format = useDisplayFormatters();
	const when = (iso: string, timeZone: string) => format.dateParts(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
	return {
		text: (summary: ForecastSummary) => {
			if (summary.kind === "forecastPending") {
				return summary.from
					? t("preview.forecastPending", { value: usd(summary.valueUsd), date: when(summary.from, summary.timeZone) })
					: t("preview.value", { value: usd(summary.valueUsd) });
			}
			const values = { value: usd(summary.valueUsd), projected: usd(summary.projectedUsd), date: when(summary.by, summary.timeZone) };
			return summary.reachesAt && summary.limitUsd !== null
				? t("preview.forecastReaches", { ...values, limit: usd(summary.limitUsd), reachDate: when(summary.reachesAt, summary.timeZone) })
				: t("preview.forecast", values);
		},
		short: (summary: ForecastSummary) => summary.kind === "forecastPending"
			? (summary.from ? t("row.forecastFrom", { date: when(summary.from, summary.timeZone) }) : null)
			: t("row.projectedBy", { date: when(summary.by, summary.timeZone) }),
	};
}

type SpikeSummary =
	| { kind: "spike"; currentUsd: number; baselineUsd: number; multiple: number | null; firesAtUsd: number; windowHours: number; spiking: boolean }
	| { kind: "spikePending"; currentUsd: number; windowHours: number; activeWindows: number; baselineWindows: number; needed: number };

/**
 * A spike rule's preview: "Spent $42.10 in the last 3 h, 4.2× the usual $10.02 for this window.
 * It alerts at $30.06.", or how much history it still needs.
 */
export function useSpikeSummary() {
	const t = useTranslations("SettingsUI.spendAlerts");
	const usd = useSpendUsd();
	const format = useDisplayFormatters();
	const times = (value: number) => format.number(value, { maximumFractionDigits: 1 });
	return {
		text: (summary: SpikeSummary) => {
			if (summary.kind === "spikePending") {
				return t("preview.spikePending", { hours: summary.windowHours, current: usd(summary.currentUsd), needed: summary.needed, active: summary.activeWindows });
			}
			return summary.multiple === null
				? t("preview.spikeNoBaseline", { hours: summary.windowHours, current: usd(summary.currentUsd), firesAt: usd(summary.firesAtUsd) })
				: t("preview.spike", { hours: summary.windowHours, current: usd(summary.currentUsd), multiple: times(summary.multiple), baseline: usd(summary.baselineUsd), firesAt: usd(summary.firesAtUsd) });
		},
		short: (summary: SpikeSummary) => summary.kind === "spikePending"
			? t("row.spikeLearning")
			: summary.multiple === null
				? t("row.spikeNoBaseline")
				: t("row.spikeUsual", { multiple: times(summary.multiple), baseline: usd(summary.baselineUsd) }),
	};
}

/** The name of what a rule covers: the key, member, department, provider or model it is scoped to. */
export function useScopeLabel(options: Pick<SettingsSpendRuleOptions, "keys" | "members" | "departments" | "providers">) {
	const t = useTranslations("SettingsUI.spendAlerts");
	return (scopeType: SpendRuleScope, scopeId: string | null) => {
		if (scopeType === "workspace" || !scopeId) return t("scope.workspace");
		const name = scopeType === "key" ? options.keys.find((key) => key.id === scopeId)?.name
			: scopeType === "member" ? options.members.find((member) => member.id === scopeId)?.name
				: scopeType === "department" ? options.departments.find((department) => department.id === scopeId)?.name
					: scopeType === "provider" ? options.providers.find((provider) => provider.id === scopeId)?.name ?? scopeId
						: scopeId;
		return t(`scopeLabel.${scopeType}`, { name: name || t("scopeLabel.unknown") });
	};
}

/** A small single-choice group drawn as bordered tiles (rounded-md, no radio dots). */
export function OptionTiles<T extends string>({ label, value, options, onChange, disabled, className }: {
	label: string;
	value: T;
	options: Array<{ value: T; title: string; description?: ReactNode }>;
	onChange: (value: T) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className={cn("grid gap-2 sm:grid-cols-2", className)}>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						disabled={disabled}
						onClick={() => onChange(option.value)}
						className={cn(
							"rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60",
							selected && "border-foreground/40 bg-muted/70",
						)}
					>
						<span className="block text-sm font-medium">{option.title}</span>
						{option.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span> : null}
					</button>
				);
			})}
		</div>
	);
}
