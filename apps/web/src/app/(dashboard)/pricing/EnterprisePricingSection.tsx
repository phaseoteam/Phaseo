import Link from "next/link";
import { ArrowRight, Check, Landmark, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ENTERPRISE_TIERS } from "@/lib/billing/enterprisePricing";

const sharedFeatures = ["SAML SSO and SCIM", "Departments and workspace roles", "Audit and governance controls", "Priority support foundations"];

export function EnterprisePricingSection() {
	return (
		<section className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<p className="text-sm font-medium text-muted-foreground">Enterprise, self-serve</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Identity and payment terms for larger teams</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">Add SSO, SCIM, governance and priority support without changing how model usage is billed. Included Payments adds a monthly fee-free card allowance and supported USD bank transfers.</p>
				</div>
				<Button asChild className="h-10 shrink-0"><Link href="/settings/workspaces/settings?enterprise=configure">Build my plan <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
			</div>

			<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 lg:grid-cols-[0.72fr_1.28fr] lg:divide-x lg:divide-zinc-200/80 lg:dark:divide-zinc-800/80">
				<div className="py-6 lg:pr-8">
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
						<div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-foreground" /><h3 className="text-sm font-semibold">Core</h3></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Enterprise controls with the standard 5% credit top-up fee.</p></div>
						<div><div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-foreground" /><h3 className="text-sm font-semibold">Included Payments</h3></div><p className="mt-2 text-sm leading-6 text-muted-foreground">The same controls, plus included payment benefits for predictable monthly funding.</p></div>
					</div>
					<ul className="mt-6 grid gap-2 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-1">
						{sharedFeatures.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />{feature}</li>)}
					</ul>
					<p className="mt-6 text-xs text-muted-foreground">USD monthly billing. No sales call required.</p>
				</div>

				<div className="overflow-x-auto py-2 lg:pl-8">
					<div className="min-w-[34rem]">
						<div className="grid grid-cols-[1.1fr_0.9fr_0.9fr] border-b border-zinc-200/80 px-3 py-3 text-xs font-medium text-muted-foreground dark:border-zinc-800/80">
							<span>Active members</span><span>Core</span><span>Included Payments</span>
						</div>
						{ENTERPRISE_TIERS.map((tier) => (
							<div key={tier.key} className="grid grid-cols-[1.1fr_0.9fr_0.9fr] items-center border-b border-zinc-200/70 px-3 py-4 last:border-0 dark:border-zinc-800/70">
								<p className="text-sm font-medium text-foreground">{tier.label}</p>
								<div><p><span className="text-base font-semibold text-foreground">${tier.coreMonthlyUsd}</span><span className="text-xs text-muted-foreground">/month</span></p><p className="mt-1 text-xs text-muted-foreground">Standard top-up fee</p></div>
								<div><p><span className="text-base font-semibold text-foreground">${tier.includedPaymentsMonthlyUsd}</span><span className="text-xs text-muted-foreground">/month</span></p><p className="mt-1 text-xs text-muted-foreground">${tier.includedCardTopUpUsd.toLocaleString("en-US")} allowance</p></div>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
