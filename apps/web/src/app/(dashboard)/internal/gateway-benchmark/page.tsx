import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import GatewayBenchmarkClient from "./GatewayBenchmarkClient";

export const metadata = {
	title: "Gateway Benchmark - Internal",
	description:
		"Run side-by-side visual comparisons of Phaseo Gateway and OpenRouter using public client-visible streaming metrics.",
};

export default async function GatewayBenchmarkPage() {
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

	return <GatewayBenchmarkClient />;
}
