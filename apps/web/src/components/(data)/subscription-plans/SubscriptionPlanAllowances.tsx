import type { SubscriptionAllowance } from "@/lib/fetchers/subscription-plans/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLocale, getTranslations } from "next-intl/server";

export default async function SubscriptionPlanAllowances({ allowances }: { allowances: SubscriptionAllowance[] }) {
	if (!allowances.length) return null;
	const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
	const quantity = (value: number) => new Intl.NumberFormat(locale).format(value);
	const qualifier = (kind: string) => kind === "up_to" ? t("Common.ui.subscriptionCatalog.up_to") : kind === "approximate" ? t("Common.ui.subscriptionCatalog.approximate") : kind === "estimated" ? t("Common.ui.subscriptionCatalog.estimated") : null;
	const scope = (value: string) => value === "seat" ? t("Common.ui.subscriptionCatalog.seat") : value === "workspace" ? t("Common.dropdown.workspace") : value === "organisation" ? t("Common.search.palette.context.entities.organisation") : value === "payer_account" ? t("Common.ui.subscriptionCatalog.payer_account") : t("Common.ui.privacyEligibility.account");
	return <section className="space-y-4">
		<h2 className="text-xl font-semibold">{t("Common.ui.subscriptionCatalog.plan_allowances")}</h2>
		<Table aria-label={t("Common.ui.subscriptionCatalog.plan_allowances")}>
			<TableHeader><TableRow><TableHead>{t("Common.ui.subscriptionCatalog.published_allowance")}</TableHead><TableHead>{t("Common.ui.versionedPricing.quantity")}</TableHead><TableHead>{t("SettingsUI.routingStudioLegacy.window")}</TableHead><TableHead>{t("Common.ui.modelEditor.conditions")}</TableHead></TableRow></TableHeader>
			<TableBody>{allowances.map((allowance) => <TableRow key={allowance.allowance_uuid}>
				<TableCell>{allowance.allowance_key}</TableCell>
				<TableCell>{allowance.display_text ?? (allowance.quantity_kind === "unlimited" ? t("Product.tools.pricing.unlimited") : allowance.quantity == null ? t("Common.status.unknown") : `${qualifier(allowance.quantity_kind) ? `${qualifier(allowance.quantity_kind)} ` : ""}${quantity(allowance.quantity)}${allowance.quantity_max == null ? "" : `–${quantity(allowance.quantity_max)}`} ${allowance.unit}`)}</TableCell>
				<TableCell>{allowance.window_kind === "none" ? "—" : allowance.window_unit && allowance.window_count != null ? `${new Intl.NumberFormat(locale, { style: "unit", unit: allowance.window_unit, unitDisplay: "long" }).format(allowance.window_count)}${allowance.window_kind === "rolling" ? ` · ${t("Common.ui.subscriptionCatalog.rolling")}` : ""}` : t("Common.status.unknown")}</TableCell>
				<TableCell className="text-muted-foreground">{[allowance.allocation_basis !== "unknown" ? `${t("Common.ui.subscriptionCatalog.allocation")}: ${scope(allowance.allocation_basis)}` : null,
					allowance.pool_scope !== "unknown" ? `${t("Common.ui.subscriptionCatalog.pool_scope")}: ${scope(allowance.pool_scope)}` : null,
					allowance.grant_condition === "login" ? t("Common.ui.subscriptionCatalog.on_login") : allowance.grant_condition, allowance.conditions].filter(Boolean).join(" · ") || "—"}</TableCell>
			</TableRow>)}</TableBody>
		</Table>
	</section>;
}
