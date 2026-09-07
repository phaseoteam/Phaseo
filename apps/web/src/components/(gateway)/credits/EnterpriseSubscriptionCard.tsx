"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IdentityAddonSummary } from "@/lib/billing/identityAddon";

type Props = {
	workspaceId: string;
};

async function responseJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? "Enterprise billing is unavailable");
	return body as T;
}

export default function EnterpriseSubscriptionCard({ workspaceId }: Props) {
	const [summary, setSummary] = React.useState<IdentityAddonSummary | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [working, setWorking] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		void fetch(`/api/stripe/addons/identity?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
			.then((response) => responseJson<IdentityAddonSummary>(response))
			.then((result) => {
				if (!cancelled) setSummary(result);
			})
			.catch((error) => {
				// Billing details are restricted to workspace billing admins. Do not make
				// the general Credits page noisy for members who cannot see this panel.
				if (!cancelled && error instanceof Error && !/unauthorized|forbidden/i.test(error.message)) {
					toast.error(error.message);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	async function openPortal() {
		setWorking(true);
		try {
			const result = await responseJson<{ url: string }>(await fetch("/api/stripe/billing-portal", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ workspaceId, returnUrl: window.location.href }),
			}));
			window.location.assign(result.url);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not open billing");
			setWorking(false);
		}
	}

	if (loading) return <Skeleton className="h-36 w-full rounded-xl" />;
	if (!summary?.active) return null;

	const periodEnd = summary.currentPeriodEnd
		? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEnd))
		: null;
	const status = summary.grandfathered
		? "Included for this workspace"
		: periodEnd
			? summary.cancelAtPeriodEnd ? `Cancels ${periodEnd}` : `Renews ${periodEnd}`
			: "Subscription active";

	return (
		<section className="space-y-4 border-y border-border/60 py-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 rounded-lg border border-border/70 bg-muted/30 p-2 text-muted-foreground">
						<ShieldCheck className="h-4 w-4" />
					</div>
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-semibold">Enterprise subscription</h2>
							<Badge variant="secondary">Active</Badge>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							Identity and governance billing for this workspace, separate from model usage credits.
						</p>
					</div>
				</div>
				{summary.canAccessSettings ? (
					<Button asChild variant="ghost" size="sm">
						<Link href={`/settings/workspaces/enterprise?workspaceId=${encodeURIComponent(workspaceId)}`}>
							Enterprise settings
							<ArrowUpRight className="ml-2 h-3.5 w-3.5" />
						</Link>
					</Button>
				) : null}
			</div>

			<div className="grid gap-4 text-sm sm:grid-cols-3">
				<div>
					<p className="text-xs text-muted-foreground">Plan</p>
					<p className="mt-1 font-medium">Self Serve Enterprise</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Members included</p>
					<p className="mt-1 font-medium">{summary.includedMembers?.toLocaleString("en-US") ?? "—"}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Credit top-up fee</p>
					<p className="mt-1 font-medium">{summary.feePolicy === "included_allowance" ? "Included allowance" : "5% ($1 minimum)"}</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
				<div className="text-sm">
					<p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{status}</p>
					{summary.includedMembers ? <p className="mt-1 text-xs text-muted-foreground">Up to {summary.includedMembers.toLocaleString("en-US")} members{summary.feePolicy === "included_allowance" ? ` · $${summary.remainingCardTopUpUsd.toLocaleString("en-US")} fee-free card allowance remaining` : " · Standard credit top-up fee"}</p> : null}
				</div>
				{summary.provider === "stripe" ? (
					<Button variant="outline" onClick={openPortal} disabled={working}>
						{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						Manage subscription
						<ArrowUpRight className="ml-2 h-4 w-4" />
					</Button>
				) : (
					<p className="text-xs text-muted-foreground">This Enterprise entitlement is included and has no separate card subscription to manage.</p>
				)}
			</div>
		</section>
	);
}
