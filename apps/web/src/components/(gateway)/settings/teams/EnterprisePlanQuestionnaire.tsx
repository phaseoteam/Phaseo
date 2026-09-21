"use client";

import * as React from "react";
import { ArrowRight, Check, Loader2, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENTERPRISE_MAX_QUOTED_MEMBERS, ENTERPRISE_MIN_SELF_SERVE_MEMBERS, type EnterprisePlanVariant, type EnterpriseQuoteOption, type EnterpriseTier } from "@/lib/billing/enterprisePricing";

type QuoteResponse = {
	quoteId: string;
	expiresAt: string;
	tier: EnterpriseTier;
	recommendedVariant: EnterprisePlanVariant;
	options: EnterpriseQuoteOption[];
};

type Props = { canEdit: boolean; workspaceId: string };

async function responseJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? "Enterprise pricing is unavailable");
	return body as T;
}

export default function EnterprisePlanQuestionnaire({ canEdit, workspaceId }: Props) {
	const format = useDisplayFormatters();
	const [memberCount, setMemberCount] = React.useState(String(ENTERPRISE_MIN_SELF_SERVE_MEMBERS));
	const [needsSso, setNeedsSso] = React.useState(true);
	const [needsScim, setNeedsScim] = React.useState(true);
	const [wantsSlackConnect, setWantsSlackConnect] = React.useState(false);
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
					wantsSlackConnect,
				}),
			}));
			setQuote(result);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not calculate pricing");
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
			}));
			window.location.assign(result.url);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not start checkout");
			setWorking(false);
		}
	}

	if (quote) {
		return (
			<div className="space-y-4">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div><h3 className="text-xl font-semibold tracking-tight">{quote.tier.label}</h3><p className="mt-1 text-sm text-muted-foreground">Your monthly Enterprise subscription</p></div>
					<Button variant="ghost" size="sm" onClick={() => setQuote(null)} disabled={working}>Change answers</Button>
				</div>
			<div>
					{quote.options.map((option) => {
						return (
							<section key={option.variant} className="space-y-5 border-y border-border/60 py-5">
								<div className="flex flex-wrap items-start justify-between gap-3"><h4 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Self Serve Enterprise</h4><div><span className="text-2xl font-semibold tracking-tight">${option.monthlyUsd}</span><span className="text-sm text-muted-foreground"> / month</span></div></div>
								<div className="space-y-2 text-sm">
									{["SAML SSO and SCIM provisioning", `${format.number(option.includedMembers)} active members included`, ...(option.overageMembers > 0 ? [`Estimated ${format.number(option.overageMembers)} additional members at $${format.number(option.overageMemberMonthlyUsd, { notation: "standard" })}/member/month`, `Estimated monthly total: $${format.number(option.estimatedMonthlyUsd, { notation: "standard" })}`] : []), "Departments, roles and governance", "Standard 5% credit top-up fee"].map((feature) => <p key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</p>)}
								</div>
								<div className="flex justify-end"><Button onClick={() => checkout(option.variant)} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Subscribe</Button></div>
							</section>
						);
					})}
				</div>
				<p className="text-xs text-muted-foreground">Quote valid until {format.dateTime(quote.expiresAt)}. USD billing only.</p>
			</div>
		);
	}

	return (
		<section className="space-y-6">
			<div className="border-b border-border/60 pb-5">
				<h2 className="text-xl font-semibold">Build your Enterprise plan</h2>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">Tell us the shape of your workspace. You will get a fixed USD price immediately—no sales call and no custom contract.</p>
			</div>
			<div className="grid gap-6 lg:grid-cols-[0.75fr_1fr]">
				<div>
					<div className="space-y-2"><Label htmlFor="enterprise-members">Active members</Label><div className="relative"><Users className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="enterprise-members" className="pl-9" inputMode="numeric" min={ENTERPRISE_MIN_SELF_SERVE_MEMBERS} max={ENTERPRISE_MAX_QUOTED_MEMBERS} type="number" value={memberCount} onChange={(event) => setMemberCount(event.target.value)} /></div></div>
					<p className="mt-3 text-xs leading-5 text-muted-foreground">Volume discounts are applied automatically. Credit funding is billed separately.</p>
				</div>
				<div className="border-y border-border/60 py-1">
					<p className="mb-3 text-sm font-medium">What will you use?</p>
					{[
						{ id: "needs-sso", label: "Single sign-on", icon: ShieldCheck, checked: needsSso, set: setNeedsSso },
						{ id: "needs-scim", label: "SCIM provisioning", icon: Users, checked: needsScim, set: setNeedsScim },
						{ id: "wants-slack", label: "Slack Connect support", icon: MessagesSquare, checked: wantsSlackConnect, set: setWantsSlackConnect },
					].map(({ id, label, icon: Icon, checked, set }) => <label key={id} htmlFor={id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 py-3 last:border-0"><Checkbox id={id} checked={checked} onCheckedChange={(value) => set(value === true)} /><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{label}</span></label>)}
					<p className="mt-4 text-xs leading-5 text-muted-foreground">All Enterprise features are included in one subscription.</p>
				</div>
			</div>
			<div className="flex justify-end border-t border-border/60 pt-5"><Button onClick={calculateQuote} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Calculate my price <ArrowRight className="ml-2 h-4 w-4" /></Button></div>
		</section>
	);
}
