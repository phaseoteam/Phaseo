"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IdentityAddonSummary } from "@/lib/billing/identityAddon";

type Props = {
	workspaceId: string;
};

async function responseJson<T>(response: Response, unavailableMessage: string): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? unavailableMessage);
	return body as T;
}

export default function EnterpriseSubscriptionCard({ workspaceId }: Props) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const currency = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
	const [summary, setSummary] = React.useState<IdentityAddonSummary | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [working, setWorking] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		void fetch(`/api/stripe/addons/identity?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
			.then((response) => responseJson<IdentityAddonSummary>(response, t("landingGaps.billingUnavailable")))
			.then((result) => {
				if (!cancelled) setSummary(result);
			})
			.catch((error) => {
				// Billing details are restricted to workspace billing admins. Do not make
				// the general Credits page noisy for members who cannot see this panel.
				if (!cancelled && error instanceof Error && !/unauthorized|forbidden/i.test(error.message)) {
					toast.error(t("landingGaps.billingUnavailable"));
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [workspaceId, t]);

	async function openPortal() {
		setWorking(true);
		try {
			const result = await responseJson<{ url: string }>(await fetch("/api/stripe/billing-portal", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ workspaceId, returnUrl: window.location.href }),
			}), t("landingGaps.billingOpenFailed"));
			window.location.assign(result.url);
		} catch {
			toast.error(t("landingGaps.billingOpenFailed"));
			setWorking(false);
		}
	}

	if (loading) return <Skeleton className="h-36 w-full rounded-xl" />;
	if (!summary?.active) return null;

	const periodEnd = summary.currentPeriodEnd
		? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEnd))
		: null;
	const status = summary.grandfathered
		? t("landingGaps.includedWorkspace")
		: periodEnd
			? summary.cancelAtPeriodEnd ? t("landingGaps.cancelsDate", { date: periodEnd }) : t("landingGaps.renewsDate", { date: periodEnd })
			: t("landingGaps.subscriptionActive");

	return (
		<section className="space-y-4 border-y border-border/60 py-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 rounded-lg border border-border/70 bg-muted/30 p-2 text-muted-foreground">
						<ShieldCheck className="h-4 w-4" />
					</div>
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-semibold">{t("landingGaps.copyEnterpriseSubscription")}</h2>
							<Badge variant="secondary">{t("landingGaps.copyActive")}</Badge>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("landingGaps.identityBilling")}</p>
					</div>
				</div>
				{summary.canAccessSettings ? (
					<Button asChild variant="ghost" size="sm">
						<Link href={`/settings/workspaces/enterprise?workspaceId=${encodeURIComponent(workspaceId)}`}>
							{t("landingGaps.enterpriseSettings")}<ArrowUpRight className="ml-2 h-3.5 w-3.5" />
						</Link>
					</Button>
				) : null}
			</div>

			<div className="grid gap-4 text-sm sm:grid-cols-3">
				<div>
					<p className="text-xs text-muted-foreground">{t("landingGaps.copyPlan")}</p>
					<p className="mt-1 font-medium">{t("landingGaps.copySelfServeEnterprise")}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">{t("landingGaps.copyMembersIncluded")}</p>
					<p className="mt-1 font-medium">{summary.includedMembers?.toLocaleString(locale) ?? "—"}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">{t("landingGaps.copyCreditTopUpFee")}</p>
					<p className="mt-1 font-medium">{summary.feePolicy === "included_allowance" ? t("landingGaps.includedAllowance") : t("landingGaps.minimumFee", { minimum: currency(1) })}</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
				<div className="text-sm">
					<p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{status}</p>
					{summary.includedMembers ? <p className="mt-1 text-xs text-muted-foreground">{t("landingGaps.memberLimit", { count: summary.includedMembers })}{summary.feePolicy === "included_allowance" ? ` · ${t("landingGaps.allowanceRemaining", { amount: currency(summary.remainingCardTopUpUsd) })}` : ` · ${t("landingGaps.standardTopUp")}`}</p> : null}
				</div>
				{summary.provider === "stripe" ? (
					<Button variant="outline" onClick={openPortal} disabled={working}>
						{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						{t("landingGaps.copyManageSubscription")}<ArrowUpRight className="ml-2 h-4 w-4" />
					</Button>
				) : (
					<p className="text-xs text-muted-foreground">{t("landingGaps.includedEntitlement")}</p>
				)}
			</div>
		</section>
	);
}
