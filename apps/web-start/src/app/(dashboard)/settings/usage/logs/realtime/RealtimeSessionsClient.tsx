"use client";

import { useSearchParams } from "next/navigation";
import RealtimeSessionsPanel, { type RealtimeSession } from "@/components/(gateway)/usage/RealtimeSessionsPanel";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";

export default function RealtimeSessionsClient({ scope }: { scope: AccountQueryScope }) {
	const params = useSearchParams();
	const parsed = Number(params.get("page") ?? 1);
	const page = Number.isFinite(parsed) ? Math.max(1, Math.min(10000, Math.trunc(parsed))) : 1;
	const requestedSize = Number(params.get("per_page"));
	const pageSize = [25, 50, 100].includes(requestedSize) ? requestedSize : 50;
	const query = usePrivateUsageQuery(scope, "realtime", { page: String(page), pageSize: String(pageSize) }, false, (signal) =>
		fetchPrivateUsage<{ pageSize?: number; sessions: RealtimeSession[]; hasMore: boolean }>(`/api/account/settings/usage/realtime?workspaceId=${encodeURIComponent(scope.workspaceId!)}&page=${page}&pageSize=${pageSize}`, scope, signal));
	return <PrivateUsageQuery query={query} scope={scope}>{(data) => <RealtimeSessionsPanel sessions={data.sessions} page={page} pageSize={data.pageSize ?? pageSize} hasMore={data.hasMore && page < 10000} />}</PrivateUsageQuery>;
}
