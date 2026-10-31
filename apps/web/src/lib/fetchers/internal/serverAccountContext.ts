import { currentRequestCookie } from "@/lib/server/currentRequest";
import { createClient } from "@/utils/supabase/server";
import { OBFUSCATE_INFO_COOKIE, parseObfuscateInfo } from "@/lib/obfuscation";

export async function getServerAccountContext(options: { signal?: AbortSignal } = {}): Promise<{
	accessToken: string | null;
	userId?: string | null;
	obfuscateInfo: boolean | null;
	workspaceId: string | null;
}> {
	const supabase = await createClient(options);
	const { data } = await supabase.auth.getSession();
	options.signal?.throwIfAborted();
	return {
		accessToken: data.session?.access_token ?? null,
		userId: data.session?.user.id ?? null,
		obfuscateInfo: parseObfuscateInfo(
			currentRequestCookie(OBFUSCATE_INFO_COOKIE) ?? null,
		),
		workspaceId:
			String(currentRequestCookie("activeWorkspaceId") ?? "").trim() || null,
	};
}
