"use client";

import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

export function DisplayMoneyMessage({ messageKey, amount, currency = "USD" }: {
 messageKey: "spendMoreToThreshold" | "savingVsBasic" | "onlyAway" | "qualifyNextMonth" | "belowThreshold" | "maintainPricing" | "thisMonthAmount" | "perMonth" | "basicTierDescription" | "enterpriseTierDescription";
 amount: number;
 currency?: string;
}) {
 const t = useTranslations("SettingsUI.credits");
 const format = useDisplayFormatters();
 return <>{t(messageKey, { amount: format.number(amount, {
  style: "currency", currency, maximumFractionDigits: 0, notation: "standard",
 }) })}</>;
}
