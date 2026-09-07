"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProviderInspectorSheet, ProviderInspectorSheetContent, ProviderInspectorSheetDescription, ProviderInspectorSheetHeader, ProviderInspectorSheetTitle } from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { DetailKeyValueGrid, DetailSection } from "./DetailDialogPrimitives";

export type RealtimeSession = {
	session_id: string; provider: string; model_id: string; voice: string | null; status: string;
	started_at: string; connected_at: string | null; ended_at: string | null;
	reserved_nanos: number; captured_nanos: number; released_nanos: number;
	estimated_cost_nanos: number; final_cost_nanos: number | null; currency: string;
	reservation_count: number; disconnect_reason: string | null; error_code: string | null;
	usage: Record<string, unknown>; pricing_lines: unknown[];
};

function money(session: RealtimeSession, nanos: number) {
	return new Intl.NumberFormat("en-US", { style: "currency", currency: session.currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(nanos) / 1e9);
}
function held(session: RealtimeSession) {
	return Math.max(0, Number(session.reserved_nanos) - Number(session.captured_nanos) - Number(session.released_nanos));
}
function date(value: string | null) {
	return value ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
}
function duration(session: RealtimeSession) {
	if (!session.ended_at) return session.connected_at ? "In progress" : "—";
	const seconds = Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.connected_at ?? session.started_at)) / 1000));
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function Status({ session }: { session: RealtimeSession }) {
	return <Badge variant="outline" className={session.status === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : session.status === "failed" || session.status === "billing_unresolved" ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""}>{session.status.replaceAll("_", " ")}</Badge>;
}

export default function RealtimeSessionsPanel({ sessions, page, hasMore }: { sessions: RealtimeSession[]; page: number; hasMore: boolean }) {
	const router = useRouter();
	const [refreshing, startTransition] = useTransition();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = sessions.find(session => session.session_id === selectedId);
	return <div className="space-y-4">
		<div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{sessions.length} sessions on this page</p><Button variant="outline" size="sm" disabled={refreshing} onClick={() => startTransition(() => router.refresh())}><RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />Refresh</Button></div>
		<div className="overflow-hidden rounded-lg border" aria-busy={refreshing}>
			<Table className="min-w-[900px] text-xs"><TableHeader><TableRow className="h-9"><TableHead>Started (UTC)</TableHead><TableHead>Session</TableHead><TableHead>Model</TableHead><TableHead>Voice</TableHead><TableHead>Status</TableHead><TableHead>Duration</TableHead><TableHead className="text-right">Charged</TableHead><TableHead className="text-right">Held</TableHead></TableRow></TableHeader>
				<TableBody>{sessions.length === 0 ? <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No realtime sessions found.</TableCell></TableRow> : sessions.map(session => <TableRow key={session.session_id} className="h-14 cursor-pointer hover:bg-muted/40" data-state={selectedId === session.session_id ? "selected" : undefined} onClick={() => setSelectedId(session.session_id)}>
					<TableCell className="whitespace-nowrap"><time dateTime={session.started_at}>{date(session.started_at).replace(" UTC", "")}</time></TableCell>
					<TableCell><button className="rounded font-mono underline-offset-4 hover:underline focus-visible:outline-2" aria-label={`View session ${session.session_id}`} onClick={() => setSelectedId(session.session_id)}>{session.session_id.slice(0, 12)}…</button></TableCell>
					<TableCell><div className="font-medium">{session.model_id}</div><div className="mt-0.5 text-muted-foreground">{session.provider}</div></TableCell><TableCell className="capitalize">{session.voice ?? "Default"}</TableCell><TableCell><Status session={session} /></TableCell><TableCell className="whitespace-nowrap tabular-nums">{duration(session)}</TableCell><TableCell className="text-right tabular-nums">{money(session, session.captured_nanos)}</TableCell><TableCell className="text-right tabular-nums">{money(session, held(session))}</TableCell>
				</TableRow>)}</TableBody>
			</Table>
		</div>
		<nav aria-label="Realtime session pages" className="flex items-center justify-end gap-4 text-sm"><span className="text-muted-foreground">Page {page}</span>{page > 1 ? <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={`?page=${page - 1}`}>Previous</Link> : <span aria-disabled="true" className="text-muted-foreground">Previous</span>}{hasMore ? <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={`?page=${page + 1}`}>Next</Link> : <span aria-disabled="true" className="text-muted-foreground">Next</span>}</nav>
		<ProviderInspectorSheet open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }}>
			<ProviderInspectorSheetContent className="sm:w-[640px] sm:max-w-[calc(100vw-2rem)]">
				{selected && <><ProviderInspectorSheetHeader className="border-b pr-16"><ProviderInspectorSheetTitle>Realtime session</ProviderInspectorSheetTitle><ProviderInspectorSheetDescription>{selected.model_id} · {selected.voice ?? "Default voice"}</ProviderInspectorSheetDescription><div className="mt-2"><Status session={selected} /></div></ProviderInspectorSheetHeader>
				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
					<div className="flex items-center gap-2"><span className="break-all font-mono text-xs">{selected.session_id}</span><CopyButton content={selected.session_id} variant="ghost" size="sm" aria-label="Copy session ID" /></div>
					{selected.status === "billing_unresolved" && <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm">Final provider usage is unavailable. The remaining hold is retained pending billing review.</p>}
					<DetailSection title="Billing"><DetailKeyValueGrid items={[
						{ label: "Charged", value: money(selected, selected.captured_nanos) }, { label: "Currently held", value: money(selected, held(selected)) },
						{ label: "Released", value: money(selected, selected.released_nanos) }, { label: selected.final_cost_nanos == null ? "Estimated cost" : "Final cost", value: money(selected, selected.final_cost_nanos ?? selected.estimated_cost_nanos) },
						{ label: "Reserved", value: money(selected, selected.reserved_nanos) }, { label: "Reservations", value: selected.reservation_count },
					]} /></DetailSection>
					<DetailSection title="Session"><DetailKeyValueGrid items={[
						{ label: "Provider", value: selected.provider }, { label: "Duration", value: duration(selected) }, { label: "Started", value: date(selected.started_at) }, { label: "Connected", value: date(selected.connected_at) }, { label: "Ended", value: date(selected.ended_at) }, { label: "Disconnect reason", value: selected.disconnect_reason ?? "—" }, { label: "Error", value: selected.error_code ?? "None" },
					]} /></DetailSection>
					<DetailSection title="Usage"><DetailKeyValueGrid items={Object.entries(selected.usage).filter(([, value]) => typeof value === "number").map(([key, value]) => ({ label: key.replaceAll("_", " "), value: Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 }) }))} />{Object.keys(selected.usage).length === 0 && <p className="text-sm text-muted-foreground">No usage recorded.</p>}</DetailSection>
					<DetailSection title="Raw data"><details><summary className="cursor-pointer text-sm">Usage and pricing</summary><pre className="mt-3 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify({ usage: selected.usage, pricing: selected.pricing_lines }, null, 2)}</pre></details></DetailSection>
				</div></>}
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	</div>;
}
