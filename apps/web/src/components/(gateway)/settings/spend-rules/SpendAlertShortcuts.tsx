"use client";

import { BellPlus } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { KEY_LIMIT_ALERT_PERCENT, budgetAlertPrefill, keyLimitAlertPrefill, spendAlertHref } from "./spendRuleDraft";
import type { SpendRuleBaseRef } from "./spendRules";

const REFS = new Set<string>(["daily", "weekly", "monthly"]);

/**
 * On a key's page, under a window with a cost limit: opens the spend alert editor prefilled with
 * the key scope, its daily, weekly or monthly limit as the base, and an 80% threshold.
 */
export function KeyLimitAlertShortcut({ keyId, keyName, window }: { keyId: string; keyName: string; window: SpendRuleBaseRef }) {
	const t = useTranslations("SettingsUI.spendAlerts.shortcuts");
	const name = t("keyLimitName", { key: keyName, percent: KEY_LIMIT_ALERT_PERCENT, interval: window }).slice(0, 100);
	return (
		<Link href={spendAlertHref(keyLimitAlertPrefill(keyId, window, name))} className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground underline-offset-3 hover:text-foreground hover:underline">
			<BellPlus className="size-3.5" />
			{t("keyLimit", { percent: KEY_LIMIT_ALERT_PERCENT })}
		</Link>
	);
}

/**
 * On the budgets page, beside a daily, weekly or monthly budget: opens the editor prefilled with
 * that budget as the base and 50/80/100% thresholds. Lifetime budgets cannot be a base, so it
 * renders nothing for them. Takes the interval only, so it does not depend on the budget types.
 */
export function BudgetAlertShortcut({ interval }: { interval: string }) {
	const t = useTranslations("SettingsUI.spendAlerts.shortcuts");
	if (!REFS.has(interval)) return null;
	const ref = interval as SpendRuleBaseRef;
	return (
		<Button asChild variant="ghost" size="sm" className="rounded-md">
			<Link href={spendAlertHref(budgetAlertPrefill(ref, t("budgetName", { interval: ref })))}>
				<BellPlus className="h-4 w-4" />
				{t("budget")}
			</Link>
		</Button>
	);
}
