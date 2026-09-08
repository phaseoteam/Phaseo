"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IdentityAddonSummary } from "@/lib/billing/identityAddon";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";
import WorkspaceSamlSettingsCard from "./WorkspaceSamlSettingsCard";
import WorkspaceScimSettingsCard from "./WorkspaceScimSettingsCard";
import EnterprisePlanQuestionnaire from "./EnterprisePlanQuestionnaire";

type Props = {
	workspaceId: string;
	initialSettings?: TeamSsoSettingsRow;
	canEdit: boolean;
	canConfigureEnterprise: boolean;
	mode?: "banner" | "overview" | "sso" | "scim";
};

async function responseJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? "Identity billing is unavailable");
	return body as T;
}

export default function WorkspaceIdentitySettings({ workspaceId, initialSettings, canEdit, canConfigureEnterprise, mode = "overview" }: Props) {
	const [summary, setSummary] = React.useState<IdentityAddonSummary | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [working, setWorking] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		void fetch(`/api/stripe/addons/identity?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
			.then((response) => responseJson<IdentityAddonSummary>(response))
			.then((result) => {
			if (!cancelled) setSummary(result);
		}).catch((error) => {
			if (!cancelled) toast.error(error instanceof Error ? error.message : "Identity billing is unavailable");
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => { cancelled = true; };
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

	if (loading) return <Skeleton className={mode === "banner" ? "h-24 w-full rounded-xl" : "h-72 w-full rounded-xl"} />;

	const active = Boolean(summary?.active);
	const overviewHref = `/settings/workspaces/enterprise?workspaceId=${encodeURIComponent(workspaceId)}`;
	if (mode === "banner") {
		if (!active && !canConfigureEnterprise) return null;
		return (
			<section className="flex flex-col gap-4 py-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					<div className="mt-0.5 rounded-lg border border-border/70 bg-muted/30 p-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /></div>
					<div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Enterprise</h3>{active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Preview</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{active ? "Manage identity, provisioning and Enterprise billing." : "Add SSO, SCIM, directory roles and governance to this workspace."}</p></div>
				</div>
				<Button asChild variant={active ? "outline" : "default"} size="sm"><Link href={overviewHref}>{active ? "Manage Enterprise" : "Configure Enterprise"}<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
			</section>
		);
	}
	if (!active && mode !== "overview") return canConfigureEnterprise ? (
		<div className="space-y-8">
			<section className="flex flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
				<div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Preview</h3><Badge variant="outline">Enterprise</Badge></div><p className="mt-1 max-w-xl text-sm text-muted-foreground">Explore the setup before subscribing. Controls are read-only.</p></div>
				<Button asChild size="sm"><Link href={overviewHref}>Configure Enterprise<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
			</section>
			{mode === "sso" ? <WorkspaceSamlSettingsCard workspaceId={workspaceId} initialSettings={initialSettings} canEdit={false} preview /> : <WorkspaceScimSettingsCard workspaceId={workspaceId} canEdit={false} preview />}
		</div>
	) : null;
	if (!active) return canConfigureEnterprise ? <EnterprisePlanQuestionnaire canEdit={canEdit} workspaceId={workspaceId} /> : null;
	if (mode === "sso") return <WorkspaceSamlSettingsCard workspaceId={workspaceId} initialSettings={initialSettings} canEdit={canEdit} />;
	if (mode === "scim") return <WorkspaceScimSettingsCard workspaceId={workspaceId} canEdit={canEdit} />;
	const periodEnd = summary?.currentPeriodEnd
		? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEnd))
		: null;

	return (
		<div className="space-y-6">
			<section className="space-y-5">
				<div className="divide-y divide-border/60 border-y border-border/60">
					{[["Single sign-on", "SAML for your identity provider"], ["Provisioning", "SCIM users, groups and bulk sync"], ["Directory", "Departments, roles and leads"]].map(([title, detail]) => <div key={title} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><p className="text-sm font-medium">{title}</p><p className="text-sm text-muted-foreground">{detail}</p></div>)}
				</div>
				<div className="grid gap-6 border-b border-border/60 pb-5 sm:grid-cols-2">
					<div><h3 className="text-sm font-semibold">Subscription</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plan</dt><dd>Self Serve Enterprise</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Members included</dt><dd>{summary?.includedMembers?.toLocaleString("en-US") ?? "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Credit top-up fee</dt><dd>{summary?.feePolicy === "included_allowance" ? "Included allowance" : "5% ($1 minimum)"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Renewal</dt><dd>{summary?.grandfathered ? "Included" : periodEnd ?? "Active"}</dd></div></dl></div>
					<div><h3 className="text-sm font-semibold">Administration</h3><div className="mt-3 flex flex-col items-start gap-2"><Button asChild variant="outline" size="sm"><Link href="/settings/workspaces/enterprise/directory">View directory</Link></Button><Button asChild variant="outline" size="sm"><Link href="/settings/workspaces/enterprise/departments">Manage departments</Link></Button></div></div>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="text-sm">
						<p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{summary?.grandfathered ? "Included for this workspace" : periodEnd ? summary?.cancelAtPeriodEnd ? `Cancels ${periodEnd}` : `Renews ${periodEnd}` : "Subscription active"}</p>
						{summary?.includedMembers ? <p className="mt-1 text-xs text-muted-foreground">Up to {summary.includedMembers} members{summary.feePolicy === "included_allowance" ? ` · $${summary.remainingCardTopUpUsd.toLocaleString("en-US")} fee-free card allowance remaining` : " · Standard credit top-up fee"}</p> : null}
					</div>
					{summary?.provider === "stripe" ? <Button variant="outline" onClick={openPortal} disabled={working || !canEdit}>Manage subscription <ArrowUpRight className="ml-2 h-4 w-4" /></Button> : <p className="max-w-xs text-right text-xs text-muted-foreground">Included for this workspace; there is no separate card subscription to manage.</p>}
				</div>
			</section>
		</div>
	);
}
