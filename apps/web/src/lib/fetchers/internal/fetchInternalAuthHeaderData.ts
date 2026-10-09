import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { cookies } from "next/headers";
import { withServerDeadline } from "@/lib/query/serverDeadline";
import { io } from "next/cache";

type FetchInternalAuthHeaderDataOptions = {
	query?: string;
	limit?: number;
	offset?: number;
};

export async function fetchInternalAuthHeaderData(
	options: FetchInternalAuthHeaderDataOptions = {},
): Promise<InternalAuthHeaderData> {
	await io();
	return withServerDeadline(async (signal) => {
		const [supabase, cookieStore] = await Promise.all([createClient({ signal }), cookies()]);
		const { data } = await supabase.auth.getSession();
		signal.throwIfAborted();
		if (!data.session?.access_token) return { isLoggedIn: false, teams: [] };
		const activeWorkspaceId = String(cookieStore.get("activeWorkspaceId")?.value ?? "").trim();
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
