"use client";

import * as React from "react";
import { ArrowRight, Building2, Check, CreditCard, Landmark, Loader2, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EnterprisePaymentPreference, EnterprisePlanVariant, EnterpriseQuoteOption, EnterpriseTier } from "@/lib/billing/enterprisePricing";

type QuoteResponse = {
	quoteId: string;
	expiresAt: string;
	tier: EnterpriseTier;
	recommendedVariant: EnterprisePlanVariant;
	options: EnterpriseQuoteOption[];
};

type Props = { canEdit: boolean };

async function responseJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? "Enterprise pricing is unavailable");
	return body as T;
}

export default function EnterprisePlanQuestionnaire({ canEdit }: Props) {
	const [memberCount, setMemberCount] = React.useState("25");
	const [expectedMonthlyTopUpUsd, setExpectedMonthlyTopUpUsd] = React.useState("1000");
	const [typicalTopUpUsd, setTypicalTopUpUsd] = React.useState("500");
	const [paymentPreference, setPaymentPreference] = React.useState<EnterprisePaymentPreference>("card");
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
					memberCount: Number(memberCount),
					expectedMonthlyTopUpUsd: Number(expectedMonthlyTopUpUsd),
					typicalTopUpUsd: Number(typicalTopUpUsd),
					paymentPreference,
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
				body: JSON.stringify({ quoteId: quote.quoteId, variant }),
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
					<div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Your recommendation</p><h3 className="mt-1 text-2xl font-semibold tracking-tight">{quote.tier.label}</h3></div>
					<Button variant="ghost" size="sm" onClick={() => setQuote(null)} disabled={working}>Change answers</Button>
				</div>
				<div className="grid gap-4 lg:grid-cols-2">
					{quote.options.map((option) => {
						const recommended = option.variant === quote.recommendedVariant;
						const included = option.variant === "included_payments";
						return (
							<Card key={option.variant} className={recommended ? "relative border-emerald-500/60 shadow-[0_18px_55px_-32px_rgba(16,185,129,0.9)]" : "border-border/70"}>
								{recommended ? <Badge className="absolute -top-2.5 right-4">Recommended</Badge> : null}
								<CardHeader><CardTitle className="flex items-center gap-2">{included ? <Landmark className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}{included ? "Included Payments" : "Core"}</CardTitle><div><span className="text-3xl font-semibold tracking-tight">${option.monthlyUsd}</span><span className="text-sm text-muted-foreground"> / month</span></div></CardHeader>
								<CardContent className="space-y-2 text-sm">
									{["SSO, SCIM and directory controls", `Up to ${option.includedMembers} active members`, "Audit and governance foundations", included ? `$${option.includedCardTopUpUsd.toLocaleString("en-US")} fee-free card allowance` : "Standard 5% credit top-up fee", included ? "No Phaseo surcharge on supported bank transfers" : "Upgrade payment policy at any time"].map((feature) => <p key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</p>)}
								</CardContent>
								<CardFooter><Button className="w-full" variant={recommended ? "default" : "outline"} onClick={() => checkout(option.variant)} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Choose {included ? "Included Payments" : "Core"}</Button></CardFooter>
							</Card>
						);
					})}
				</div>
				<p className="text-xs text-muted-foreground">Quote valid until {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(quote.expiresAt))}. USD billing only.</p>
			</div>
		);
	}

	return (
		<Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_38%)]">
			<CardHeader className="border-b border-border/60">
				<div className="flex items-center gap-3"><div className="rounded-xl bg-foreground p-2.5 text-background"><Building2 className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Configure instantly</p><CardTitle className="mt-1 text-2xl">Build your Enterprise plan</CardTitle></div></div>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">Tell us the shape of your workspace. You will get a fixed USD price immediately—no sales call and no custom contract.</p>
			</CardHeader>
			<CardContent className="grid gap-6 pt-6 lg:grid-cols-[1fr_0.85fr]">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2"><Label htmlFor="enterprise-members">Active members</Label><div className="relative"><Users className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="enterprise-members" className="pl-9" inputMode="numeric" min={1} max={500} type="number" value={memberCount} onChange={(event) => setMemberCount(event.target.value)} /></div></div>
					<div className="space-y-2"><Label>Preferred funding</Label><Select value={paymentPreference} onValueChange={(value) => setPaymentPreference(value as EnterprisePaymentPreference)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="card">Card</SelectItem><SelectItem value="ach">ACH Direct Debit</SelectItem><SelectItem value="bank_transfer">USD bank transfer</SelectItem></SelectContent></Select></div>
					<div className="space-y-2"><Label htmlFor="enterprise-monthly-topup">Expected monthly credit purchases</Label><div className="relative"><span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span><Input id="enterprise-monthly-topup" className="pl-7" inputMode="numeric" min={0} type="number" value={expectedMonthlyTopUpUsd} onChange={(event) => setExpectedMonthlyTopUpUsd(event.target.value)} /></div></div>
					<div className="space-y-2"><Label htmlFor="enterprise-typical-topup">Typical top-up</Label><div className="relative"><span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span><Input id="enterprise-typical-topup" className="pl-7" inputMode="numeric" min={0} type="number" value={typicalTopUpUsd} onChange={(event) => setTypicalTopUpUsd(event.target.value)} /></div></div>
				</div>
				<div className="rounded-xl border border-border/60 bg-background/70 p-4">
					<p className="mb-3 text-sm font-medium">What will you use?</p>
					{[
						{ id: "needs-sso", label: "Single sign-on", icon: ShieldCheck, checked: needsSso, set: setNeedsSso },
						{ id: "needs-scim", label: "SCIM provisioning", icon: Users, checked: needsScim, set: setNeedsScim },
						{ id: "wants-slack", label: "Slack Connect support", icon: MessagesSquare, checked: wantsSlackConnect, set: setWantsSlackConnect },
					].map(({ id, label, icon: Icon, checked, set }) => <label key={id} htmlFor={id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 py-3 last:border-0"><Checkbox id={id} checked={checked} onCheckedChange={(value) => set(value === true)} /><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{label}</span></label>)}
					<div className="mt-4 flex gap-2 rounded-lg bg-muted/45 p-3 text-xs leading-5 text-muted-foreground"><CreditCard className="mt-0.5 h-4 w-4 shrink-0" />Included Payments is recommended when its allowance saves more than the subscription uplift.</div>
				</div>
			</CardContent>
			<CardFooter className="justify-end border-t bg-muted/15"><Button onClick={calculateQuote} disabled={working || !canEdit}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Calculate my price <ArrowRight className="ml-2 h-4 w-4" /></Button></CardFooter>
		</Card>
	);
}
