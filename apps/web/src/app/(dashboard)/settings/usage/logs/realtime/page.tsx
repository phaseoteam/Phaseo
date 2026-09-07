import { Suspense } from "react";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import RealtimeSessionsPanel, { type RealtimeSession } from "@/components/(gateway)/usage/RealtimeSessionsPanel";

export const metadata = { title: "Realtime Sessions - Settings" };

async function SessionList({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
	const [context, params] = await Promise.all([getServerAccountContext(), searchParams]);
	if (!context.accessToken || !context.workspaceId) return <p>Select a workspace to view realtime sessions.</p>;
	const parsed = Number(params.page);
	const page = Number.isFinite(parsed) ? Math.max(1, Math.min(10000, Math.trunc(parsed))) : 1;
	let data: { sessions: RealtimeSession[]; hasMore: boolean };
	try {
		data = await fetchAccountWebApi(`/api/account/settings/usage/realtime?workspaceId=${encodeURIComponent(context.workspaceId)}&page=${page}`, context.accessToken);
	} catch {
		return <p role="alert">Realtime sessions could not be loaded. Refresh to try again.</p>;
	}
	return <RealtimeSessionsPanel key={context.workspaceId} sessions={data.sessions} page={page} hasMore={data.hasMore && page < 10000} />;
}

export default function RealtimeSessionsPage(props: { searchParams: Promise<{ page?: string }> }) {
	return <div className="space-y-5"><div><h1 className="text-2xl font-semibold">Realtime Sessions</h1><p className="mt-1 text-sm text-muted-foreground">Voice sessions, usage, and charges.</p></div><Suspense fallback={<div role="status" className="rounded-lg border p-8 text-sm text-muted-foreground">Loading sessions…</div>}><SessionList {...props} /></Suspense></div>;
}
