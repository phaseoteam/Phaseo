"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, Ban, Check, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { createItemFromErrorGroup, updateErrorGroup } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { frameLocation, sampleFrames, sampleText } from "@/lib/work/format";
import { ERROR_GROUP_STATUSES, type ErrorGroup, type ErrorGroupStatus, type ErrorProject, type WorkMappedFrame } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { TimeAgo } from "./WorkBits";

function errorsHref(status: ErrorGroupStatus, projectId: string | null): string {
	const search = new URLSearchParams();
	if (status !== "open") search.set("status", status);
	if (projectId) search.set("projectId", projectId);
	const query = search.toString();
	return query ? `/work/errors?${query}` : "/work/errors";
}

export function ErrorsView({ status, projectId, groups, projects }: { status: ErrorGroupStatus; projectId: string | null; groups: ErrorGroup[]; projects: ErrorProject[] }) {
	const t = useTranslations("Work.errors");
	const router = useRouter();
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h2 className="text-base font-semibold">{t("title")}</h2>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<nav aria-label={t("title")} className="flex gap-1">
					{ERROR_GROUP_STATUSES.map((name) => (
						<Link
							key={name}
							href={errorsHref(name, projectId)}
							aria-current={name === status ? "page" : undefined}
							className={cn("rounded-md px-2.5 py-1 text-sm transition-colors", name === status ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
						>
							{t(`tabs.${name}`)}
						</Link>
					))}
				</nav>
				{projects.length ? (
					<Select value={projectId ?? "all"} onValueChange={(value) => router.push(errorsHref(status, value === "all" ? null : value))}>
						<SelectTrigger size="sm" aria-label={t("project")} className="w-48 rounded-md">
							<SelectValue>{projects.find((project) => project.id === projectId)?.name ?? t("allProjects")}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">{t("allProjects")}</SelectItem>
							{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
						</SelectContent>
					</Select>
				) : null}
			</div>
			{groups.length ? (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead className="border-b text-left text-xs text-muted-foreground">
							<tr>
								<th className="px-3 py-2 font-normal">{t("error")}</th>
								<th className="px-3 py-2 text-right font-normal">{t("events")}</th>
								<th className="px-3 py-2 text-right font-normal">{t("people")}</th>
								<th className="px-3 py-2 font-normal">{t("firstSeen")}</th>
								<th className="px-3 py-2 font-normal">{t("lastSeen")}</th>
								<th className="px-3 py-2 font-normal">{t("project")}</th>
								<th className="px-3 py-2 font-normal">{t("item")}</th>
								<th className="px-3 py-2"><span className="sr-only">{t("status")}</span></th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{groups.map((group) => (
								<tr key={group.id} className="align-top hover:bg-muted/40">
									<td className="max-w-md px-3 py-2">
										<Link href={`/work/errors/${group.id}`} className="block hover:underline">
											<span className="font-mono text-xs font-medium">{group.exceptionType}</span>
											<span className="block truncate text-sm">{group.message}</span>
										</Link>
										{group.culprit ? <span className="block truncate font-mono text-xs text-muted-foreground">{group.culprit}</span> : null}
									</td>
									<td className="px-3 py-2 text-right tabular-nums">{group.eventCount}</td>
									<td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{group.usersCount ?? 0}</td>
									<td className="px-3 py-2 text-xs text-muted-foreground"><TimeAgo value={group.firstSeenAt} /></td>
									<td className="px-3 py-2 text-xs text-muted-foreground"><TimeAgo value={group.lastSeenAt} /></td>
									<td className="px-3 py-2 text-xs text-muted-foreground">{group.projectName ?? projects.find((project) => project.id === group.projectId)?.name ?? "—"}</td>
									<td className="px-3 py-2 text-xs">{group.workItemNumber ? <Link href={`/work/${group.workItemNumber}`} className="font-mono hover:underline">#{group.workItemNumber}</Link> : "—"}</td>
									<td className="px-3 py-1.5"><ErrorGroupActions group={group} compact /></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t(`empty.${status}`)}</p>}
		</div>
	);
}

export function ErrorGroupActions({ group, compact = false }: { group: ErrorGroup; compact?: boolean }) {
	const t = useTranslations("Work.errors");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const size = compact ? "xs" : "sm";
	const createItem = async () => {
		const result = await perform("item", () => createItemFromErrorGroup(group.id), { refresh: false });
		if (result.ok) router.push(`/work/${result.item.number}`);
	};
	return (
		<div className="flex flex-wrap justify-end gap-1.5">
			{group.workItemNumber ? (
				compact ? null : <Button asChild size={size} variant="outline"><Link href={`/work/${group.workItemNumber}`}><ArrowUpRight aria-hidden="true" />{t("openItem")}</Link></Button>
			) : (
				<Button type="button" size={size} variant="outline" disabled={busy !== null} onClick={createItem}><ArrowUpRight aria-hidden="true" />{t("createItem")}</Button>
			)}
			{group.status === "open" ? (
				<>
					<Button type="button" size={size} variant="ghost" disabled={busy !== null} onClick={() => perform("resolve", () => updateErrorGroup(group.id, "resolved"))}><Check aria-hidden="true" />{t("resolve")}</Button>
					<Button type="button" size={size} variant="ghost" disabled={busy !== null} onClick={() => perform("ignore", () => updateErrorGroup(group.id, "ignored"))}><Ban aria-hidden="true" />{t("ignore")}</Button>
				</>
			) : (
				<Button type="button" size={size} variant="ghost" disabled={busy !== null} onClick={() => perform("reopen", () => updateErrorGroup(group.id, "open"))}><RotateCcw aria-hidden="true" />{t("reopen")}</Button>
			)}
		</div>
	);
}

export function ErrorGroupDetail({ group, projectName, mappedFrames = null }: { group: ErrorGroup; projectName: string | null; mappedFrames?: WorkMappedFrame[] | null }) {
	const t = useTranslations("Work.errors");
	const frames: WorkMappedFrame[] = mappedFrames ?? sampleFrames(group.lastEvent);
	const url = sampleText(group.lastEvent, "url");
	const userAgent = sampleText(group.lastEvent, "userAgent");
	const rows: Array<[string, ReactNode]> = [
		[t("status"), t(`statuses.${group.status}`)],
		[t("events"), <span key="count" className="tabular-nums">{group.eventCount}</span>],
		[t("people"), <span key="people" className="tabular-nums">{group.usersCount ?? 0}</span>],
		[t("firstSeen"), <TimeAgo key="first" value={group.firstSeenAt} />],
		[t("lastSeen"), <TimeAgo key="last" value={group.lastSeenAt} />],
		[t("project"), projectName ?? "—"],
		[t("release"), group.lastRelease ?? "—"],
		[t("firstRelease"), group.firstRelease ?? "—"],
		[t("environment"), group.lastEnvironment ?? "—"],
		[t("item"), group.workItemNumber ? <Link key="item" href={`/work/${group.workItemNumber}`} className="font-mono hover:underline">#{group.workItemNumber}</Link> : "—"],
	];
	if (group.resolvedInRelease) rows.push([t("resolvedIn"), <span key="resolved" className="font-mono text-xs">{group.resolvedInRelease}</span>]);
	if (url) rows.push([t("url"), <span key="url" className="font-mono text-xs break-all">{url}</span>]);
	if (userAgent) rows.push([t("userAgent"), <span key="ua" className="text-xs break-all">{userAgent}</span>]);
	rows.push([t("fingerprint"), <span key="fp" className="font-mono text-xs break-all">{group.fingerprint}</span>]);
	return (
		<div className="space-y-6">
			<nav className="flex items-center gap-1 text-xs text-muted-foreground">
				<Link href="/work/errors" className="hover:text-foreground">{t("back")}</Link>
				<ChevronRight className="size-3" aria-hidden="true" />
				<span className="font-mono">{group.exceptionType}</span>
			</nav>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<h2 className="font-mono text-base font-semibold">{group.exceptionType}</h2>
					<p className="text-sm break-words whitespace-pre-wrap">{group.message}</p>
					{group.culprit ? <p className="font-mono text-xs text-muted-foreground">{group.culprit}</p> : null}
				</div>
				<ErrorGroupActions group={group} />
			</div>
			<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
				{rows.map(([label, value]) => (
					<div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
						<dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
						<dd className="min-w-0">{value}</dd>
					</div>
				))}
			</dl>
			<section aria-labelledby="error-stack" className="space-y-2">
				<h3 id="error-stack" className="text-sm font-medium">{t("stack")}</h3>
				{mappedFrames ? <p className="text-xs text-muted-foreground">{t("sourceMapped")}</p> : null}
				{frames.length ? (
					<ol className="divide-y rounded-md border font-mono text-xs">
						{frames.map((frame, index) => (
							<li key={index} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5", frame.inApp === false && "text-muted-foreground")}>
								<span className="font-medium">{frame.original?.function ?? frame.function ?? "?"}</span>
								<span className="min-w-0 flex-1 break-all text-muted-foreground">
									{frame.original ? <span className="text-foreground">{`${frame.original.file}:${frame.original.line}:${frame.original.column}`}</span> : frameLocation(frame)}
									{frame.original ? <span className="block text-[11px]">{frameLocation(frame)}</span> : null}
								</span>
								{frame.inApp ? <span className="font-sans text-[11px] text-sky-700 dark:text-sky-300">{t("inApp")}</span> : null}
							</li>
						))}
					</ol>
				) : <p className="text-sm text-muted-foreground">{t("noFrames")}</p>}
			</section>
		</div>
	);
}
