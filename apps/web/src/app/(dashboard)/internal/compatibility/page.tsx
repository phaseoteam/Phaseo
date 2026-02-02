import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CompatibilityClient from "./CompatibilityClient";

export const metadata = {
	title: "Gateway Compatibility - Internal",
	description:
		"Validate gateway responses against official OpenAI and Anthropic response schemas.",
};

export default async function CompatibilityPage() {
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userError || userData?.role !== "admin") {
		redirect("/");
	}

	return <CompatibilityClient />;
}

