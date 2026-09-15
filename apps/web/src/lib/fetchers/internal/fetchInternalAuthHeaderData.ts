import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { cookies } from "next/headers";

export async function fetchInternalAuthHeaderData(): Promise<InternalAuthHeaderData> {
	const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
	const { data } = await supabase.auth.getSession();
	const activeWorkspaceId = String(
		cookieStore.get("activeWorkspaceId")?.value ?? "",
	).trim();
	return fetchAccountWebApi<InternalAuthHeaderData>(
		"/api/account/auth/header",
		data.session?.access_token,
		activeWorkspaceId
			? {
				headers: {
					Cookie: `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}`,
				},
			}
			: undefined,
	);
}
