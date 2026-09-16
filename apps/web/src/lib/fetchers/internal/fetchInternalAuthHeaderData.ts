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
	const options = activeWorkspaceId
		? { headers: { Cookie: `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}` } }
		: undefined;
	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			return await fetchAccountWebApi<InternalAuthHeaderData>(
				"/api/account/auth/header",
				data.session?.access_token,
				options,
			);
		} catch (error) {
			lastError = error;
			if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw lastError;
}
