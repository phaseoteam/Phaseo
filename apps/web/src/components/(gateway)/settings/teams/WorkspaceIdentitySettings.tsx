"use client";

import * as React from "react";
import { ArrowUpRight, Building2, Check, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { IdentityAddonSummary } from "@/lib/billing/identityAddon";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";
import WorkspaceSamlSettingsCard from "./WorkspaceSamlSettingsCard";
import EnterprisePlanQuestionnaire from "./EnterprisePlanQuestionnaire";

type Props = {
	workspaceId: string;
	initialSettings?: TeamSsoSettingsRow;
	canEdit: boolean;
};

async function responseJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body?.error ?? "Identity billing is unavailable");
	return body as T;
}

export default function WorkspaceIdentitySettings({ workspaceId, initialSettings, canEdit }: Props) {
	const [summary, setSummary] = React.useState<IdentityAddonSummary | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [working, setWorking] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		void fetch("/api/stripe/addons/identity", { cache: "no-store" })
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
				body: JSON.stringify({ returnUrl: window.location.href }),
			}));
			window.location.assign(result.url);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not open billing");
			setWorking(false);
		}
	}

	if (loading) return <Skeleton className="h-72 w-full rounded-xl" />;

	const active = Boolean(summary?.active);
	if (!active) return <EnterprisePlanQuestionnaire canEdit={canEdit} />;
	const periodEnd = summary?.currentPeriodEnd
		? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(summary.currentPeriodEnd))
		: null;

	return (
		<div className="space-y-4">
			<Card className="overflow-hidden border-border/70 bg-background/70 shadow-sm">
				<div className="h-1 bg-[linear-gradient(90deg,var(--color-emerald-500),var(--color-cyan-500),transparent)]" />
				<CardHeader className="gap-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
								<ShieldCheck className="h-5 w-5" />
							</div>
							<div>
								<CardTitle>Identity</CardTitle>
								<CardDescription>SSO, SCIM provisioning and directory controls.</CardDescription>
							</div>
						</div>
						<Badge>Active</Badge>
					</div>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-3">
					{[
						{ icon: Building2, title: "Single sign-on", detail: "SAML for your identity provider" },
						{ icon: RefreshCw, title: "Provisioning", detail: "SCIM users, groups and bulk sync" },
						{ icon: Users, title: "Directory", detail: "Departments, roles and leads" },
					].map(({ icon: Icon, title, detail }) => (
						<div key={title} className="rounded-lg border border-border/60 bg-muted/20 p-3">
							<Icon className="mb-2 h-4 w-4 text-muted-foreground" />
							<p className="text-sm font-medium">{title}</p>
							<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
						</div>
					))}
				</CardContent>
				<CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10">
					<div className="text-sm">
						<p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{summary?.grandfathered ? "Included for this workspace" : periodEnd ? `Renews ${periodEnd}` : "Subscription active"}</p>
						{summary?.includedMembers ? <p className="mt-1 text-xs text-muted-foreground">Up to {summary.includedMembers} members{summary.feePolicy === "included_allowance" ? ` · $${summary.remainingCardTopUpUsd.toLocaleString("en-US")} fee-free card allowance remaining` : " · Standard credit top-up fee"}</p> : null}
					</div>
					{!summary?.grandfathered ? (
						<Button variant="outline" onClick={openPortal} disabled={working || !canEdit}>Manage billing <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
					) : null}
				</CardFooter>
			</Card>

			<WorkspaceSamlSettingsCard workspaceId={workspaceId} initialSettings={initialSettings} canEdit={canEdit} />
		</div>
	);
}
