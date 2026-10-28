"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
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
