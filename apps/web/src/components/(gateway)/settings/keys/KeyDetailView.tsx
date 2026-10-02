import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserUsageChip } from "./UserUsageChip";
import { KeyUsageCharts } from "./KeyUsageCharts";
import { KeyNameHeading } from "./KeyNameHeading";
import KeySettingsForm from "@/components/(gateway)/settings/keys/KeySettingsForm";
import { KeyPageActions } from "@/components/(gateway)/settings/keys/KeyPageActions";
import { type KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";


export async function KeyDetailView({ data }: { data: KeyDetailData }) {
	const { key, usage } = data;
	const [t, locale] = await Promise.all([getTranslations("SettingsUI"), getLocale()]);
	const date = (value: string | null | undefined, empty: string) => value ? new Date(value).toLocaleString(locale, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : empty;
	const expired = key.expires_at && Date.parse(key.expires_at) <= data.observedAt;
	return <div className="mx-auto w-full max-w-6xl space-y-8 pb-10">
		<header className="flex items-center justify-between gap-4 border-b pb-6">
			<div className="flex min-w-0 items-center gap-4">
				<Button variant="ghost" size="icon" asChild><Link href="/settings/keys" aria-label={t("keyDetail.back")}><ArrowLeft className="size-4" /></Link></Button>
				<div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><KeyNameHeading key={key.name} k={key} canManage={data.canManage} /><Badge variant="outline">{expired ? t("labels.expired") : key.status === "active" ? t("labels.enabled") : t("labels.disabled")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{data.workspaceName ?? t("labels.workspace")} · {t("usageViewFilters.apiKey")}</p></div>
			</div>
			{data.canManage && <KeyPageActions k={key} />}
		</header>
		<section className="rounded-xl border bg-card p-6">
			<h2 className="mb-5 text-base font-semibold">{t("keyDetail.information")}</h2>
			<dl className="grid gap-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
				{[
					[t("keyDetail.prefix"), `${key.prefix}…`], [t("teams.createdBy"), key.created_by ? <UserUsageChip userId={key.created_by} name={data.creatorName} avatarUrl={data.creatorAvatarUrl} workspaceId={key.workspace_id} /> : t("teams.unknown")],
					[t("teams.created"), date(key.created_at, t("teams.unknown"))], [t("oauthDetail.lastUsed"), date(key.last_used_at ?? (String(usage?.last_used_at ?? "") || null), t("labels.never"))],
					[t("strings.Expires"), date(key.expires_at, t("labels.noExpiry"))], [t("keyDetail.keyId"), key.id],
				].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}
			</dl>
		</section>
		<section className="space-y-4">
			<div className="flex items-center justify-between"><h2 className="text-base font-semibold">{t("teams.usage")}</h2><Button variant="outline" size="sm" asChild><Link href={`/settings/usage/logs?key=${encodeURIComponent(key.id)}&workspaceId=${encodeURIComponent(key.workspace_id)}`}>{t("keyDetail.viewLogs")}</Link></Button></div>
			{usage === null ? <p className="text-sm text-muted-foreground">{t("keyDetail.usageUnavailable")}</p> : <div className="grid gap-4 md:grid-cols-3">
				{[[t("labels.today"), "daily"], [t("labels.thisWeek"), "weekly"], [t("labels.thisMonth"), "monthly"]].map(([label, period]) => <div key={period} className="rounded-xl border bg-card p-5"><h3 className="text-sm font-medium text-muted-foreground">{label}</h3><p className="mt-3 text-2xl font-semibold tabular-nums">{Number(usage[`${period}_request_count`] ?? 0).toLocaleString(locale)} <span className="text-sm font-normal text-muted-foreground">{t("strings.requests")}</span></p><p className="mt-2 text-sm tabular-nums">{t("keyDetail.spent", { amount: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(Number(usage[`${period}_cost_nanos`] ?? 0) / 1e9) })}</p></div>)}
			</div>}
			<p className="text-xs text-muted-foreground">{t("keyDetail.usagePeriod")}</p>
			<KeyUsageCharts chart={data.chart} />
		</section>
		<section className="space-y-4"><h2 className="text-base font-semibold">{t("headers.settings")}</h2>{data.canManage ? <KeySettingsForm key={JSON.stringify(key)} k={key} /> : <p className="text-sm text-muted-foreground">{t("keyDetail.adminOnly")}</p>}</section>
	</div>;
}
