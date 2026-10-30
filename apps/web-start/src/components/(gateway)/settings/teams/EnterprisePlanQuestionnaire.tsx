"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import * as React from "react";
import { ArrowRight, Check, Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENTERPRISE_BASE_INCLUDED_MEMBERS, ENTERPRISE_MAX_QUOTED_MEMBERS, ENTERPRISE_MIN_SELF_SERVE_MEMBERS, type EnterprisePlanVariant, type EnterpriseQuoteOption, type EnterpriseTier } from "@/lib/billing/enterprisePricing";

type QuoteResponse = {
	quoteId: string;
	expiresAt: string;
	tier: EnterpriseTier;
	recommendedVariant: EnterprisePlanVariant;
	options: EnterpriseQuoteOption[];
};

type Props = { canEdit: boolean; workspaceId: string };

async function responseJson<T>(response: Response, unavailableMessage: string): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? unavailableMessage);
	return body as T;
}

export default function EnterprisePlanQuestionnaire({ canEdit, workspaceId }: Props) {
	const t = useTranslations("SettingsUI");
	const s = React.useCallback(
		(key: string, values?: Record<string, string>) =>
			t(settingsStringKey(key) as never, values as never),
		[t],
	);
	const format = useDisplayFormatters();
	const [memberCount, setMemberCount] = React.useState(String(ENTERPRISE_BASE_INCLUDED_MEMBERS));
	const [needsSso, setNeedsSso] = React.useState(true);
	const [needsScim, setNeedsScim] = React.useState(true);
	const [quote, setQuote] = React.useState<QuoteResponse | null>(null);
	const [working, setWorking] = React.useState(false);

	async function calculateQuote() {
		setWorking(true);
		try {
			const result = await responseJson<QuoteResponse>(await fetch("/api/stripe/addons/identity/quote", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					memberCount: Number(memberCount),
					expectedMonthlyTopUpUsd: 0,
					typicalTopUpUsd: 0,
					paymentPreference: "card",
					needsSso,
					needsScim,
					wantsSlackConnect: false,
				}),
			}), s("Enterprise pricing is unavailable"));
			setQuote(result);
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not calculate pricing")));
		} finally {
			setWorking(false);
		}
	}

	async function checkout(variant: EnterprisePlanVariant) {
		if (!quote) return;
		setWorking(true);
		try {
			const result = await responseJson<{ url: string }>(await fetch("/api/stripe/addons/identity", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ workspaceId, quoteId: quote.quoteId, variant }),
			}), s("Enterprise pricing is unavailable"));
			window.location.assign(result.url);
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not start checkout")));
			setWorking(false);
		}
	}

	if (quote) {
		return (
			<div className="space-y-4">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div><h3 className="text-xl font-semibold tracking-tight">{s("{count} active members included", { count: format.number(quote.options[0].includedMembers) })}</h3><p className="mt-1 text-sm text-muted-foreground">{s("Your monthly Enterprise subscription")}</p></div>
					<Button variant="ghost" size="sm" onClick={() => setQuote(null)} disabled={working}>{s("Change answers")}</Button>
				</div>
			<div>
					{quote.options.map((option) => {
						return (
							<section key={option.variant} className="space-y-5 border-y border-border/60 py-5">
								<div className="flex flex-wrap items-start justify-between gap-3"><h4 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />{s("Self Serve Enterprise")}</h4><div><span className="text-2xl font-semibold tracking-tight">${option.monthlyUsd}</span><span className="text-sm text-muted-foreground">{s(" / month")}</span></div></div>
								<div className="space-y-2 text-sm">
									{[s("SAML SSO and SCIM provisioning"), s("{count} active members included", { count: format.number(option.includedMembers) }), ...(option.overageMembers > 0 ? [s("Estimated {count} additional members at ${price}/member/month", { count: format.number(option.overageMembers), price: format.number(option.overageMemberMonthlyUsd, { notation: "standard" }) }), s("Estimated monthly total: ${amount}", { amount: format.number(option.estimatedMonthlyUsd, { notation: "standard" }) })] : []), s("Departments, roles and governance"), s("Standard 5% credit top-up fee")].map((feature) => <p key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</p>)}
								</div>
				<div className="flex justify-end"><Button onClick={() => checkout(option.variant)} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{s("Subscribe")}</Button></div>
							</section>
						);
					})}
				</div>
			<p className="text-xs text-muted-foreground">{s("phraseQuoteValidUntilDateUSDBillingOnly", { date: format.dateTime(quote.expiresAt) })}</p>
			</div>
		);
	}

	return (
		<section className="space-y-6">
			<div className="border-b border-border/60 pb-5">
				<h2 className="text-xl font-semibold">{s("Build your Enterprise plan")}</h2>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">{s("phraseTellUsTheShapeOfYourWorkspaceYouWillGetAFixedUSDPriceImmediatelyNoSalesCallAndNoCustomContract")}</p>
			</div>
			<div className="grid gap-6 lg:grid-cols-[0.75fr_1fr]">
				<div>
					<div className="space-y-2"><Label htmlFor="enterprise-members">{s("Active members")}</Label><div className="relative"><Users className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="enterprise-members" className="pl-9" inputMode="numeric" min={ENTERPRISE_MIN_SELF_SERVE_MEMBERS} max={ENTERPRISE_MAX_QUOTED_MEMBERS} type="number" value={memberCount} onChange={(event) => setMemberCount(event.target.value)} /></div></div>
					<p className="mt-3 text-xs leading-5 text-muted-foreground">{s("phraseVolumeDiscountsAreAppliedAutomaticallyCreditFundingIsBilledSeparately")}</p>
				</div>
				<div className="border-y border-border/60 py-1">
					<p className="mb-3 text-sm font-medium">{s("What will you use?")}</p>
					{[
						{ id: "needs-sso", label: s("Single sign-on"), icon: ShieldCheck, checked: needsSso, set: setNeedsSso },
						{ id: "needs-scim", label: s("SCIM provisioning"), icon: Users, checked: needsScim, set: setNeedsScim },
					].map(({ id, label, icon: Icon, checked, set }) => <label key={id} htmlFor={id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 py-3 last:border-0"><Checkbox id={id} checked={checked} onCheckedChange={(value) => set(value === true)} /><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{label}</span></label>)}
					<p className="mt-4 text-xs leading-5 text-muted-foreground">{s("phraseAllEnterpriseFeaturesAreIncludedInOneSubscription")}</p>
				</div>
			</div>
			<div className="flex justify-end border-t border-border/60 pt-5"><Button onClick={calculateQuote} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{s("Calculate my price")} <ArrowRight className="ml-2 h-4 w-4" /></Button></div>
		</section>
	);
}
