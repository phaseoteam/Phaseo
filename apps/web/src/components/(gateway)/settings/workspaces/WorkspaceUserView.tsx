"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { KeyUsageCharts } from "../keys/KeyUsageCharts";
import { keyDetailHref } from "../keys/keyDetailHref";
import type { WorkspaceUserData } from "@/lib/fetchers/internal/fetchWorkspaceUser";
import { WorkspaceUserModelIdentity } from "./WorkspaceUserModelIdentity";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead, nextTableSort, type TableSort } from "../../usage/SortableTableHead";
import { sortWorkspaceUserModels, type WorkspaceUserModelSortKey } from "./workspaceUserModelSort";

export function WorkspaceUserView({ data }: { data: WorkspaceUserData }) {
	const t = useTranslations("SettingsUI");
	const format = useDisplayFormatters();
	const modelMetadata = new Map(data.modelMetadataEntries ?? []);
	const locale = useLocale();
	const [modelSort, setModelSort] = useState<TableSort<WorkspaceUserModelSortKey>>(null);
	const models = sortWorkspaceUserModels(data.analytics?.models ?? [], modelMetadata, modelSort, locale);
	const changeModelSort = (key: WorkspaceUserModelSortKey) => setModelSort((current) => nextTableSort(current, key));
	const name = data.profile.name ?? t("oauthDetail.unknownUser");
	const money = (value: number) => format.number(value, { style: "currency", currency: "USD", maximumFractionDigits: 4, notation: "standard" });
	const pageHref = (page: number) => `/settings/workspaces/users/${encodeURIComponent(data.profile.id)}?${new URLSearchParams({ workspaceId: data.workspaceId, keyPage: String(page) })}#keys`;
	return <div className="mx-auto max-w-6xl space-y-8 pb-10">
		<header className="flex flex-wrap items-center gap-4 border-b pb-6">
			<Button variant="ghost" size="icon" asChild><Link href={`/settings/workspaces/members?${new URLSearchParams({ workspaceId: data.workspaceId })}`} aria-label={t("workspaceUser.back")}><ArrowLeft className="size-4" /></Link></Button>
			<Avatar className="size-14">{data.profile.avatarUrl && <AvatarImage src={data.profile.avatarUrl} alt="" />}<AvatarFallback>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</AvatarFallback></Avatar>
			<div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{name}</h1><p className="text-sm text-muted-foreground">{data.workspaceName}{data.joinedAt && <> · {t("workspaceUser.joined", { date: format.date(data.joinedAt) })}</>}</p></div>
			{data.role && <Badge variant="outline">{t(data.role === "owner" ? "workspaceUser.owner" : data.role === "admin" ? "workspaceUser.admin" : "workspaceUser.member")}</Badge>}
		</header>
		<section id="activity" className="scroll-mt-20 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t("teams.usage")}</h2><Button variant="outline" asChild><Link href={`/settings/usage/overview?${new URLSearchParams({ workspaceId: data.workspaceId, user: data.profile.id, usage_preset: "last_30d" })}`}>{t("workspaceUser.viewActivity")}</Link></Button></div>
			<p className="text-sm text-muted-foreground">{t("workspaceUser.usageScope")}</p>
			{data.analytics ? <>
				<div className="grid gap-4 sm:grid-cols-3">{[[t("oauthDetail.requests"), format.number(data.analytics.requests)], [t("keyDetail.spendUsd"), money(data.analytics.spendUsd)], [t("headers.apiKeys"), format.number(data.keyCount)]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>
				<KeyUsageCharts chart={{ from: data.from, to: data.to, points: data.analytics.points }} />
			</> : <p className="rounded-xl border p-5 text-sm text-muted-foreground">{t("keyDetail.usageUnavailable")}</p>}
		</section>
		<section className="space-y-4"><h2 className="text-lg font-semibold">{t("workspaceUser.topModels")}</h2>
			{data.analytics === null ? <p className="text-sm text-muted-foreground">{t("keyDetail.usageUnavailable")}</p> : !data.analytics.models.length ? <p className="text-sm text-muted-foreground">{t("keyDetail.noRequests")}</p> : <div className="min-w-0 max-w-full overflow-hidden rounded-md border">
				<ScrollArea className="w-full" scrollBarOrientation="horizontal" keepScrollbarMounted viewportClassName="w-full pb-2">
					<Table wrapInContainer={false} aria-label={t("workspaceUser.topModels")} data-density="regular" className="isolate border-separate border-spacing-0 whitespace-nowrap text-xs [&_tr]:border-0 [&_thead_th]:border-b [&_tbody_tr:not(:last-child)>td]:border-b [&_tbody_td:not([colspan])]:py-2">
						<TableHeader><TableRow className="h-9">
							<SortableTableHead label={t("strings.Model")} sortKey="model" activeSort={modelSort} onSortChange={changeModelSort} />
							<SortableTableHead label={t("oauthDetail.requests")} sortKey="requests" activeSort={modelSort} onSortChange={changeModelSort} className="text-right" />
							<SortableTableHead label={t("keyDetail.spendUsd")} sortKey="spendUsd" activeSort={modelSort} onSortChange={changeModelSort} className="text-right" />
						</TableRow></TableHeader>
						<TableBody>{models.map((model) => <TableRow key={model.modelId}>
							<TableCell className="py-2 font-medium"><WorkspaceUserModelIdentity modelId={model.modelId} metadata={modelMetadata} /></TableCell>
							<TableCell className="py-2 text-right font-mono text-xs tabular-nums">{format.number(model.requests)}</TableCell><TableCell className="py-2 text-right font-mono text-xs tabular-nums">{money(model.spendUsd)}</TableCell>
						</TableRow>)}</TableBody>
					</Table>
				</ScrollArea>
			</div>}
		</section>
		<section id="keys" className="scroll-mt-20 space-y-4"><h2 className="text-lg font-semibold">{t("headers.apiKeys")} <span className="text-muted-foreground">{format.number(data.keyCount)}</span></h2>
			{!data.keys.length ? <p className="text-sm text-muted-foreground">{t("workspaceUser.noKeys")}</p> : <div className="divide-y rounded-xl border">{data.keys.map((key) => <Link key={key.id} href={keyDetailHref(key)} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40"><div className="min-w-0"><p className="break-all font-medium">{key.name}</p><p className="text-sm text-muted-foreground">{key.prefix}… · {format.date(key.created_at)}</p></div><Badge variant="outline">{t(key.status === "active" ? "labels.enabled" : "labels.disabled")}</Badge></Link>)}</div>}
			{(data.keyPage > 1 || data.hasMoreKeys) && <nav className="flex gap-3" aria-label={t("headers.apiKeys")}>{data.keyPage > 1 && <Button variant="outline" asChild><Link href={pageHref(data.keyPage - 1)}>{t("workspaceUser.previous")}</Link></Button>}{data.hasMoreKeys && <Button variant="outline" asChild><Link href={pageHref(data.keyPage + 1)}>{t("workspaceUser.next")}</Link></Button>}</nav>}
		</section>
		<section id="logs" className="scroll-mt-20 space-y-4"><h2 className="text-lg font-semibold">{t("workspaceUser.recentLogs")}</h2><p className="text-sm text-muted-foreground">{t("workspaceUser.logsScope")}</p>
			{data.logs === null ? <p className="text-sm text-muted-foreground">{t("workspaceUser.logsUnavailable")}</p> : !data.logs.length ? <p className="text-sm text-muted-foreground">{t("workspaceUser.noLogs")}</p> : <div className="divide-y rounded-xl border">{data.logs.map((log) => <Link key={log.request_id} href={`/settings/usage/logs/requests/${encodeURIComponent(log.request_id)}?${new URLSearchParams({ workspaceId: data.workspaceId })}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40"><div className="min-w-0"><WorkspaceUserModelIdentity modelId={log.model_id} metadata={modelMetadata} linked={false} /><p className="text-xs text-muted-foreground">{format.dateTime(log.created_at)}</p></div><div className="flex items-center gap-3"><span className="text-sm tabular-nums">{money(Number(log.cost_nanos ?? 0) / 1e9)}</span><Badge variant="outline">{t(log.success ? "workspaceUser.success" : "workspaceUser.failed")}</Badge></div></Link>)}</div>}
		</section>
	</div>;
}
