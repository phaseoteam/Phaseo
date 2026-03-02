import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { OBFUSCATE_INFO_COOKIE, parseObfuscateInfo } from "@/lib/obfuscation";

export async function getUserObfuscationPreference(
	userId: string | null | undefined
): Promise<boolean> {
	const cookieStore = await cookies();
	const cookieValue = cookieStore.get(OBFUSCATE_INFO_COOKIE)?.value ?? null;
	const cookiePreference = parseObfuscateInfo(cookieValue);
	if (cookiePreference != null) return cookiePreference;

	if (!userId) return false;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("users")
		.select("obfuscate_info")
		.eq("user_id", userId)
		.maybeSingle();

	if (error) {
		console.warn("[obfuscation] failed to fetch user preference", {
			userId,
			error: error.message,
		});
		return false;
	}

	return Boolean(data?.obfuscate_info);
}
