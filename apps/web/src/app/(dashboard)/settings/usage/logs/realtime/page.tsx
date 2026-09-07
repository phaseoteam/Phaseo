import { Suspense } from "react";
import Link from "next/link";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Realtime Sessions - Settings" };

type Session = {
	session_id: string; provider: string; model_id: string; voice: string | null; status: string;
	started_at: string; connected_at: string | null; ended_at: string | null;
	reserved_nanos: number; captured_nanos: number; released_nanos: number;
	estimated_cost_nanos: number; final_cost_nanos: number | null; currency: string;
	reservation_count: number; disconnect_reason: string | null; error_code: string | null;
	usage: Record<string, unknown>; pricing_lines: unknown[];
};

async function SessionList({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
	const [context, params] = await Promise.all([getServerAccountContext(), searchParams]);
	if (!context.accessToken || !context.workspaceId) return <p>Select a workspace to view realtime sessions.</p>;
	const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.page) || 1)));
	let data: { sessions: Session[]; hasMore: boolean };
	try {
		data = await fetchAccountWebApi(`/api/account/settings/usage/realtime?workspaceId=${encodeURIComponent(context.workspaceId)}&page=${page}`, context.accessToken);
	} catch {
		return <p role="alert">Realtime sessions could not be loaded. Refresh to try again.</p>;
	}
	return <div className="space-y-4">
		<form><input type="hidden" name="page" value={page} /><button className="rounded-md border px-3 py-2 text-sm" type="submit">Refresh</button></form>
		{data.sessions.length === 0 ? <p className="text-sm text-muted-foreground">No realtime sessions found.</p> : data.sessions.map((session) => {
			const money = (nanos: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: session.currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(nanos) / 1e9);
			const held = Math.max(0, Number(session.reserved_nanos) - Number(session.captured_nanos) - Number(session.released_nanos));
			return <Card key={session.session_id}>
				<CardHeader><CardTitle className="text-base">{session.model_id}</CardTitle><p className="text-sm text-muted-foreground">{session.provider} · {session.voice ?? "Default voice"} · {session.status.replaceAll("_", " ")}</p></CardHeader>
				<CardContent className="space-y-3 text-sm">
					<p><time dateTime={session.started_at}>{new Date(session.started_at).toISOString().replace("T", " ").slice(0, 19)} UTC</time></p>
					<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div><dt className="text-muted-foreground">Currently held</dt><dd>{money(held)}</dd></div>
						<div><dt className="text-muted-foreground">Charged</dt><dd>{money(session.captured_nanos)}</dd></div>
						<div><dt className="text-muted-foreground">Released</dt><dd>{money(session.released_nanos)}</dd></div>
						<div><dt className="text-muted-foreground">{session.final_cost_nanos == null ? "Estimated cost" : "Final cost"}</dt><dd>{money(session.final_cost_nanos ?? session.estimated_cost_nanos)}</dd></div>
					</dl>
					{session.status === "billing_unresolved" && <p role="status">Final provider usage is unavailable. The remaining hold is retained pending billing review.</p>}
					{(session.error_code || session.disconnect_reason) && <p>{session.error_code ?? session.disconnect_reason}</p>}
					<details><summary className="cursor-pointer">Session details</summary><div className="mt-2 space-y-2">
						<p className="break-all">{session.session_id}</p>
						<p>Reserved: {money(session.reserved_nanos)} across {session.reservation_count} holds.</p>
						<p>Connected: {session.connected_at ?? "Not connected"} · Ended: {session.ended_at ?? "Not ended"}</p>
						<pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ usage: session.usage, pricing: session.pricing_lines }, null, 2)}</pre>
					</div></details>
				</CardContent>
			</Card>;
		})}
		<nav aria-label="Realtime session pages" className="flex gap-4 text-sm">
			{page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
			{data.hasMore && <Link href={`?page=${page + 1}`}>Next</Link>}
		</nav>
	</div>;
}

export default function RealtimeSessionsPage(props: { searchParams: Promise<{ page?: string }> }) {
	return <div className="space-y-5"><h1 className="text-2xl font-semibold">Realtime Sessions</h1><p className="text-sm text-muted-foreground">Voice sessions, credit holds, and final charges.</p><Suspense fallback={<p>Loading sessions…</p>}><SessionList {...props} /></Suspense></div>;
}
