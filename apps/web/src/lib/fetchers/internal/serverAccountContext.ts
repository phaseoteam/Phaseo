import { cookies } from "next/headers";
import { io } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { OBFUSCATE_INFO_COOKIE, parseObfuscateInfo } from "@/lib/obfuscation";

export async function getServerAccountContext(): Promise<{
	accessToken: string | null;
	obfuscateInfo: boolean | null;
	workspaceId: string | null;
}> {
	// Supabase Auth reads the current time while loading a session. Mark this
	// shared auth boundary as request-time work so Cache Components never try
	// to capture that session state in a prerendered shell.
	await io();
	const [cookieStore, supabase] = await Promise.all([cookies(), createClient()]);
	const { data } = await supabase.auth.getSession();
	return {
		accessToken: data.session?.access_token ?? null,
		obfuscateInfo: parseObfuscateInfo(
			cookieStore.get(OBFUSCATE_INFO_COOKIE)?.value ?? null,
		),
		workspaceId:
			String(cookieStore.get("activeWorkspaceId")?.value ?? "").trim() || null,
	};
}
