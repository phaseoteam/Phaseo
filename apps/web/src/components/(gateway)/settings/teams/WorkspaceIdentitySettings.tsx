"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
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
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const enterprise = (key: string, values?: Record<string, string | number>) =>
		(t as unknown as (messageKey: string, messageValues?: Record<string, string | number>) => string)(`enterpriseIdentity.${key}`, values);
	const format = useDisplayFormatters();
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
			if (!cancelled) toast.error(localizedSettingsError(error, t, "Action failed"));
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
			toast.error(localizedSettingsError(error, t, "Action failed"));
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
					<div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{enterprise("enterprise")}</h3>{active ? <Badge variant="secondary">{enterprise("active")}</Badge> : <Badge variant="outline">{enterprise("preview")}</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{active ? enterprise("activeDescription") : enterprise("previewDescription")}</p></div>
				</div>
				<Button asChild variant={active ? "outline" : "default"} size="sm"><Link href={overviewHref}>{active ? enterprise("manageEnterprise") : enterprise("configure")}<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
			</section>
		);
	}
	if (!active && mode !== "overview") return canConfigureEnterprise ? (
		<div className="space-y-8">
			<section className="flex flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
				<div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{enterprise("preview")}</h3><Badge variant="outline">{enterprise("enterprise")}</Badge></div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{enterprise("readOnlyDescription")}</p></div>
				<Button asChild size="sm"><Link href={overviewHref}>{enterprise("configure")}<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
			</section>
			{mode === "sso" ? <WorkspaceSamlSettingsCard workspaceId={workspaceId} initialSettings={initialSettings} canEdit={false} preview /> : <WorkspaceScimSettingsCard workspaceId={workspaceId} canEdit={false} preview />}
		</div>
	) : null;
	if (!active) return canConfigureEnterprise ? <EnterprisePlanQuestionnaire canEdit={canEdit} workspaceId={workspaceId} /> : null;
	if (mode === "sso") return <WorkspaceSamlSettingsCard workspaceId={workspaceId} initialSettings={initialSettings} canEdit={canEdit} />;
	if (mode === "scim") return <WorkspaceScimSettingsCard workspaceId={workspaceId} canEdit={canEdit} />;
	const periodEnd = summary?.currentPeriodEnd ? format.date(summary.currentPeriodEnd) : null;

	return (
		<div className="space-y-6">
			<section className="space-y-5">
					<div className="divide-y divide-border/60 border-y border-border/60">
					{[[enterprise("singleSignOn"), enterprise("singleSignOnDetail")], [enterprise("provisioning"), enterprise("provisioningDetail")], [enterprise("directory"), enterprise("directoryDetail")]].map(([title, detail]) => <div key={title} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><p className="text-sm font-medium">{title}</p><p className="text-sm text-muted-foreground">{detail}</p></div>)}
				</div>
				<div className="grid gap-6 border-b border-border/60 pb-5 sm:grid-cols-2">
					<div><h3 className="text-sm font-semibold">{enterprise("subscription")}</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">{enterprise("plan")}</dt><dd>{enterprise("selfServePlan")}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">{enterprise("membersIncluded")}</dt><dd>{summary?.includedMembers == null ? "—" : format.number(summary.includedMembers)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">{enterprise("creditTopUpFee")}</dt><dd>{summary?.feePolicy === "included_allowance" ? enterprise("includedAllowance") : enterprise("minimumTopUpFee", { percent: format.number(0.05, { style: "percent", maximumFractionDigits: 1 }), minimum: format.number(1, { style: "currency", currency: "USD" }) })}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">{enterprise("renewal")}</dt><dd>{summary?.grandfathered ? enterprise("includedAllowance") : periodEnd ? (summary?.cancelAtPeriodEnd ? enterprise("cancelsOn", { date: periodEnd }) : enterprise("renewsOn", { date: periodEnd })) : enterprise("active")}</dd></div></dl></div>
					<div><h3 className="text-sm font-semibold">{enterprise("administration")}</h3><div className="mt-3 flex flex-col items-start gap-2"><Button asChild variant="outline" size="sm"><Link href="/settings/workspaces/enterprise/directory">{enterprise("viewDirectory")}</Link></Button><Button asChild variant="outline" size="sm"><Link href="/settings/workspaces/enterprise/departments">{enterprise("manageDepartments")}</Link></Button></div></div>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="text-sm">
						<p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{summary?.grandfathered ? enterprise("includedForWorkspace") : periodEnd ? (summary?.cancelAtPeriodEnd ? enterprise("cancelsOn", { date: periodEnd }) : enterprise("renewsOn", { date: periodEnd })) : enterprise("subscriptionActive")}</p>
						{summary?.includedMembers ? <p className="mt-1 text-xs text-muted-foreground">{enterprise("upToMembers", { count: summary.includedMembers })}{summary.feePolicy === "included_allowance" ? " · " + enterprise("feeFreeAllowance", { amount: format.number(summary.remainingCardTopUpUsd, { style: "currency", currency: "USD" }) }) : " · " + enterprise("standardTopUpFee")}</p> : null}
					</div>
				{summary?.provider === "stripe" ? <Button variant="outline" onClick={openPortal} disabled={working || !canEdit}>{enterprise("manageSubscription")} <ArrowUpRight className="ml-2 h-4 w-4" /></Button> : <p className="max-w-xs text-right text-xs text-muted-foreground">{enterprise("noSeparateSubscription")}</p>}
				</div>
			</section>
		</div>
	);
}
