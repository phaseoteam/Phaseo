import { Suspense } from "react";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import RealtimeSessionsClient from "./RealtimeSessionsClient";

export const metadata = { title: "Realtime Sessions - Settings" };

async function SessionList(_props: { searchParams: Promise<{ page?: string; per_page?: string }> }) {
	const scope = await getPrivateUsageScope();
	return <RealtimeSessionsClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} />;
}

export default function RealtimeSessionsPage(props: { searchParams: Promise<{ page?: string; per_page?: string }> }) {
	return <div className="min-w-0 space-y-4"><div><h1 className="text-2xl font-semibold tracking-tight">Realtime Sessions</h1><p className="mt-1 text-sm text-muted-foreground">Voice sessions, usage, and charges.</p></div><Suspense fallback={<div role="status" className="rounded-lg border p-8 text-sm text-muted-foreground">Loading sessions…</div>}><SessionList {...props} /></Suspense></div>;
}
