import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { currentRequestCookie } from "@/lib/server/currentRequest";
import { withServerDeadline } from "@/lib/query/serverDeadline";

type FetchInternalAuthHeaderDataOptions = {
	query?: string;
	limit?: number;
	offset?: number;
};

export async function fetchInternalAuthHeaderData(
	options: FetchInternalAuthHeaderDataOptions = {},
): Promise<InternalAuthHeaderData> {
	return withServerDeadline(async (signal) => {
		const supabase = await createClient({ signal });
		const { data } = await supabase.auth.getSession();
		signal.throwIfAborted();
		if (!data.session?.access_token) return { isLoggedIn: false, teams: [] };
		const activeWorkspaceId = String(currentRequestCookie("activeWorkspaceId") ?? "").trim();
		const searchParams = new URLSearchParams();
		if (options.query?.trim()) searchParams.set("q", options.query.trim());
		if (typeof options.limit === "number") searchParams.set("limit", String(options.limit));
		if (typeof options.offset === "number") searchParams.set("offset", String(options.offset));
		const serializedSearch = searchParams.toString();
		const path = `/api/account/auth/header${serializedSearch ? `?${serializedSearch}` : ""}` as const;
		return fetchAccountWebApi<InternalAuthHeaderData>(path, data.session?.access_token, {
			signal,
			...(activeWorkspaceId ? { headers: { Cookie: `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}` } } : {}),
		});
	});
}
