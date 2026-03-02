import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import LatencyComparisonClient from "./LatencyComparisonClient";

export const metadata: Metadata = {
	title: "Latency Comparison - Compare Gateway vs OpenAI Response Times",
	description:
		"Compare response times between your gateway and OpenAI API with real-time streaming metrics.",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function LatencyComparisonPage() {
	const supabase = await createClient();

	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userData } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.single();

	if (userData?.role !== "admin") {
		redirect("/");
	}

	return <LatencyComparisonClient />;
}
