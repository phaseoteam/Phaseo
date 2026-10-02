"use client";

import { useLocale, useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfigurableLogTable from "./ConfigurableLogTable";
import { REALTIME_COLUMNS } from "./logColumns";
import { ProviderInspectorSheet, ProviderInspectorSheetContent, ProviderInspectorSheetDescription, ProviderInspectorSheetHeader, ProviderInspectorSheetTitle } from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { DetailKeyValueGrid, DetailSection } from "./DetailDialogPrimitives";
import { usePrivateUsageRefresh } from "./PrivateUsageQuery";
import { toast } from "sonner";

export type RealtimeSession = {
	session_id: string; provider: string; model_id: string; voice: string | null; status: string;
	started_at: string; connected_at: string | null; ended_at: string | null;
	reserved_nanos: number; captured_nanos: number; released_nanos: number;
	estimated_cost_nanos: number; final_cost_nanos: number | null; currency: string;
	reservation_count: number; disconnect_reason: string | null; error_code: string | null;
	usage: Record<string, unknown>; pricing_lines: unknown[];
};

function held(session: RealtimeSession) {
	return Math.max(0, Number(session.reserved_nanos) - Number(session.captured_nanos) - Number(session.released_nanos));
}
function Status({ session }: { session: RealtimeSession }) {
	const t = useTranslations("SettingsUI");
	const labels: Record<string, string> = { completed: t("realtimeCopy.copyCompleted"), failed: t("realtimeCopy.copyFailed"), expired: t("realtimeCopy.copyExpired"), connected: t("realtimeCopy.copyConnected"), reserved: t("realtimeCopy.copyReserved"), created: t("realtimeCopy.copyCreated"), cancelled: t("realtimeCopy.copyCancelled"), connecting: t("realtimeCopy.connecting"), ending: t("realtimeCopy.ending"), billing_unresolved: t("realtimeCopy.billingUnresolved") };
	return <Badge variant="outline" className={session.status === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : session.status === "failed" || session.status === "billing_unresolved" ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""}>{labels[session.status] ?? t("realtimeCopy.copyUnknown")}</Badge>;
}

export default function RealtimeSessionsPanel({ sessions, page, pageSize, hasMore }: { sessions: RealtimeSession[]; page: number; pageSize: number; hasMore: boolean }) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
	const money = (session: RealtimeSession, nanos: number) => new Intl.NumberFormat(locale, { style: "currency", currency: session.currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(nanos) / 1e9);
	const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "—";
	const duration = (session: RealtimeSession) => {
		if (!session.ended_at) return session.connected_at ? t("realtimeCopy.copyInProgress") : "—";
		const seconds = Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.connected_at ?? session.started_at)) / 1000));
		return seconds < 60 ? t("realtimeCopy.seconds", { seconds: number(seconds) }) : t("realtimeCopy.minutesSeconds", { minutes: number(Math.floor(seconds / 60)), seconds: number(seconds % 60) });
	};
	const usageLabels: Record<string, string> = { input_tokens: t("realtimeCopy.inputTokens"), output_tokens: t("realtimeCopy.outputTokens"), total_tokens: t("realtimeCopy.totalTokens"), cached_tokens: t("realtimeCopy.cachedTokens"), cached_read_text_tokens: t("realtimeCopy.cachedTokens"), cached_read_audio_tokens: t("realtimeCopy.cachedAudioTokens"), input_audio_tokens: t("realtimeCopy.audioInputTokens"), output_audio_tokens: t("realtimeCopy.audioOutputTokens"), audio_input_tokens: t("realtimeCopy.audioInputTokens"), audio_output_tokens: t("realtimeCopy.audioOutputTokens"), input_text_tokens: t("realtimeCopy.textInputTokens"), output_text_tokens: t("realtimeCopy.textOutputTokens"), live_seconds: t("realtimeCopy.voiceDuration") };
	const router = useRouter();
	const privateQuery = usePrivateUsageRefresh();
	const searchParams = useSearchParams();
	const [refreshing, startTransition] = useTransition();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = sessions.find(session => session.session_id === selectedId);
	function navigate(nextPage: number, nextSize = pageSize) {
		const params = new URLSearchParams(searchParams.toString());
		params.set("page", String(nextPage));
		params.set("per_page", String(nextSize));
		startTransition(() => router.push(`?${params.toString()}`, { scroll: false }));
	}
	return <div className="min-w-0 space-y-4" aria-busy={refreshing}>
		<div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" aria-label={t("realtimeCopy.copyRefreshCurrentView")} title={t("realtimeCopy.copyRefresh")} disabled={refreshing || privateQuery?.refreshing} onClick={() => { if (privateQuery) void privateQuery.refresh().catch(() => toast.error(t("realtimeCopy.refreshFailed"))); else startTransition(() => router.refresh()); }}><RefreshCw className={refreshing || privateQuery?.refreshing ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} /></Button>
				<div id="realtime-column-settings" className="flex shrink-0 items-center empty:hidden" />
			</div>
		</div>
		<ConfigurableLogTable
			tableId="realtime" label={t("realtimeCopy.realtimeSessions")} definitions={REALTIME_COLUMNS}
			rows={sessions} rowKey={(session) => session.session_id}
			settingsTargetId="realtime-column-settings"
			emptyMessage={t("realtimeCopy.noSessions")}
			onRowClick={(session) => setSelectedId(session.session_id)}
			renderCell={(session, column) => {
				switch (column) {
					case "date": return <time dateTime={session.started_at}>{date(session.started_at).replace(" UTC", "")}</time>;
					case "session": return <button className="rounded font-mono underline-offset-4 hover:underline focus-visible:outline-2" aria-label={t("realtimeCopy.viewSession", { id: session.session_id })} onClick={() => setSelectedId(session.session_id)}>{session.session_id.length > 12 ? `${session.session_id.slice(0, 12)}…` : session.session_id}</button>;
					case "model": return <span className="font-medium">{session.model_id}</span>;
					case "provider": return session.provider;
					case "voice": return <span className="capitalize">{session.voice ?? t("realtimeCopy.copyDefault")}</span>;
					case "status": return <Status session={session} />;
					case "duration": return <span className="tabular-nums">{duration(session)}</span>;
					case "charged": return money(session, session.captured_nanos);
					case "held": return money(session, held(session));
				}
			}}
		/>
		<nav aria-label={t("realtimeCopy.sessionPages")} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<span>{t("realtimeCopy.copyRowsPerPage")}</span>
				<Select value={String(pageSize)} disabled={refreshing} onValueChange={(value) => { if (value) navigate(1, Number(value)); }}>
					<SelectTrigger size="sm" aria-label={t("realtimeCopy.copyRowsPerPage")} className="h-8 w-[72px] rounded-md border-border/70 bg-background"><SelectValue /></SelectTrigger>
					<SelectContent className="rounded-md">{[25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{number(size)}</SelectItem>)}</SelectContent>
				</Select>
			</div>
			<div className="flex items-center gap-1">
				{page > 3 && <Button variant="outline" size="sm" aria-label={t("realtimeCopy.firstPage")} disabled={refreshing} onClick={() => navigate(1)}><ChevronsLeft className="size-4" /></Button>}
				<Button variant="outline" size="sm" aria-label={t("realtimeCopy.copyPreviousPage")} disabled={page === 1 || refreshing} onClick={() => navigate(page - 1)}><ChevronLeft className="size-4" /></Button>
				{Array.from({ length: Math.min(page, 3) }, (_, index) => page - Math.min(page, 3) + index + 1).map((number) => <Button key={number} variant={number === page ? "default" : "outline"} size="sm" className="min-w-8" aria-label={t("realtimeCopy.pageNumber", { number })} aria-current={number === page ? "page" : undefined} disabled={refreshing} onClick={() => navigate(number)}>{new Intl.NumberFormat(locale).format(number)}</Button>)}
				{hasMore && <Button variant="outline" size="sm" className="min-w-8" aria-label={t("realtimeCopy.pageNumber", { number: page + 1 })} disabled={refreshing} onClick={() => navigate(page + 1)}>{number(page + 1)}</Button>}
				<Button variant="outline" size="sm" aria-label={t("realtimeCopy.copyNextPage")} disabled={!hasMore || refreshing} onClick={() => navigate(page + 1)}><ChevronRight className="size-4" /></Button>
			</div>
		</nav>
		<ProviderInspectorSheet open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }}>
			<ProviderInspectorSheetContent className="sm:w-[640px] sm:max-w-[calc(100vw-2rem)]">
				{selected && <><ProviderInspectorSheetHeader className="border-b pr-16"><ProviderInspectorSheetTitle>{t("realtimeCopy.realtimeSession")}</ProviderInspectorSheetTitle><ProviderInspectorSheetDescription>{selected.model_id} · {selected.voice ?? t("realtimeCopy.defaultVoice")}</ProviderInspectorSheetDescription><div className="mt-2"><Status session={selected} /></div></ProviderInspectorSheetHeader>
				<ScrollArea className="min-h-0 flex-1" viewportClassName="h-full"><div className="space-y-4 p-6">
					<div className="flex items-center gap-2"><span className="break-all font-mono text-xs">{selected.session_id}</span><CopyButton content={selected.session_id} variant="ghost" size="sm" aria-label={t("realtimeCopy.copyCopySessionID")} /></div>
					{selected.status === "billing_unresolved" && <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm">{t("realtimeCopy.unresolvedWarning")}</p>}
					<DetailSection title={t("realtimeCopy.copyBilling")}><DetailKeyValueGrid items={[
						{ label: t("realtimeCopy.copyCharged"), value: money(selected, selected.captured_nanos) }, { label: t("realtimeCopy.copyCurrentlyHeld"), value: money(selected, held(selected)) },
						{ label: t("realtimeCopy.copyReleased"), value: money(selected, selected.released_nanos) }, { label: selected.final_cost_nanos == null ? t("realtimeCopy.copyEstimatedCost") : t("realtimeCopy.finalCost"), value: money(selected, selected.final_cost_nanos ?? selected.estimated_cost_nanos) },
						{ label: t("realtimeCopy.copyReserved"), value: money(selected, selected.reserved_nanos) }, { label: t("realtimeCopy.reservations"), value: number(selected.reservation_count) },
					]} /></DetailSection>
					<DetailSection title={t("realtimeCopy.copySession")}><DetailKeyValueGrid items={[
						{ label: t("realtimeCopy.copyProvider"), value: selected.provider }, { label: t("realtimeCopy.copyDuration"), value: duration(selected) }, { label: t("realtimeCopy.started"), value: date(selected.started_at) }, { label: t("realtimeCopy.copyConnected"), value: date(selected.connected_at) }, { label: t("realtimeCopy.ended"), value: date(selected.ended_at) }, { label: t("realtimeCopy.disconnectReason"), value: selected.disconnect_reason ?? "—" }, { label: t("realtimeCopy.copyError"), value: selected.error_code ?? t("realtimeCopy.copyNone") },
					]} /></DetailSection>
					<DetailSection title={t("realtimeCopy.copyUsage")}><DetailKeyValueGrid items={Object.entries(selected.usage).filter(([, value]) => typeof value === "number").map(([key, value]) => ({ label: usageLabels[key] ?? key, value: number(Number(value)) }))} />{Object.keys(selected.usage).length === 0 && <p className="text-sm text-muted-foreground">{t("realtimeCopy.noUsage")}</p>}</DetailSection>
					<DetailSection title={t("realtimeCopy.rawData")}><details><summary className="cursor-pointer text-sm">{t("realtimeCopy.usagePricing")}</summary><pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify({ usage: selected.usage, pricing: selected.pricing_lines }, null, 2)}</pre></details></DetailSection>
				</div></ScrollArea></>}
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	</div>;
}
