import { createClient } from "@/utils/supabase/client";

export async function postClientAuthSignOut() {
	const { error } = await createClient().auth.signOut();
	if (error) throw error;
}
