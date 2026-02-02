"use server";

import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

export const getViewerRole = cache(async (): Promise<string | null> => {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData?.user;
	if (!authUser) return null;

	const { data, error } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", authUser.id)
		.maybeSingle();

	if (error) return null;
	return data?.role ?? null;
});

export async function isAdminViewer(): Promise<boolean> {
	return (await getViewerRole()) === "admin";
}
