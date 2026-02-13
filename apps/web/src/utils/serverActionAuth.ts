import "server-only";

import { createClient } from "@/utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function requireAuthenticatedUser(): Promise<{
	supabase: SupabaseServerClient;
	user: { id: string; email?: string | null };
}> {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user?.id) {
		throw new Error("Unauthorized");
	}

	return {
		supabase,
		user: { id: user.id, email: (user as any).email ?? null },
	};
}

export async function requireTeamMembership(
	supabase: SupabaseServerClient,
	userId: string,
	teamId: string,
	roles?: Array<"owner" | "admin" | "member">,
): Promise<void> {
	if (!userId || !teamId) throw new Error("Unauthorized");

	let q = supabase
		.from("team_members")
		.select("role")
		.eq("user_id", userId)
		.eq("team_id", teamId)
		.limit(1)
		.maybeSingle();

	if (roles?.length) {
		q = (q as any).in("role", roles);
	}

	const { data, error } = await q;
	if (error || !data) throw new Error("Unauthorized");
}

export function requireActingUser(
	expectedUserId: string,
	actualUserId: string,
) {
	if (!expectedUserId || expectedUserId !== actualUserId) {
		throw new Error("Unauthorized");
	}
}

