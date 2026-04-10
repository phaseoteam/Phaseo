import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NotifierClient from "./NotifierClient";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
	title: "Internal Model Discovery Notifier",
	description:
		"Internal admin tool for testing Discord embed notifications used by model discovery workflows.",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function InternalModelDiscoveryNotifierPage() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) redirect("/sign-in");

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		redirect("/");
	}

	return <NotifierClient />;
}
