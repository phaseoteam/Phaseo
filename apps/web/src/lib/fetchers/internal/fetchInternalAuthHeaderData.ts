import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { cookies } from "next/headers";

type FetchInternalAuthHeaderDataOptions = {
	query?: string;
	limit?: number;
	offset?: number;
};

export async function fetchInternalAuthHeaderData(
	options: FetchInternalAuthHeaderDataOptions = {},
): Promise<InternalAuthHeaderData> {
	const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
	const { data } = await supabase.auth.getSession();
	const activeWorkspaceId = String(
		cookieStore.get("activeWorkspaceId")?.value ?? "",
	).trim();
	const searchParams = new URLSearchParams();
	if (options.query?.trim()) searchParams.set("q", options.query.trim());
	if (typeof options.limit === "number") searchParams.set("limit", String(options.limit));
	if (typeof options.offset === "number") searchParams.set("offset", String(options.offset));
	const serializedSearch = searchParams.toString();
	const path = `/api/account/auth/header${serializedSearch ? `?${serializedSearch}` : ""}` as const;
	const requestOptions = activeWorkspaceId
		? { headers: { Cookie: `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}` } }
		: undefined;
	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			return await fetchAccountWebApi<InternalAuthHeaderData>(
				path,
				data.session?.access_token,
				requestOptions,
			);
		} catch (error) {
			lastError = error;
			if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw lastError;
}
