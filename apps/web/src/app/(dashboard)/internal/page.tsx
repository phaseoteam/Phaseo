import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function InternalPage() {
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

	// Test query: fetch first 5 rows for debugging
	const { data, error } = await supabase
		.from("data_api_provider_model_capabilities")
		.select("provider_api_model_id, capability_id, params, status")
		.limit(5);

	return (
		<div className="container mx-auto py-8">
			<h1 className="text-xl font-bold mb-4">
				Test: data_api_provider_model_capabilities
			</h1>
			{data && (
				<pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
					{JSON.stringify(data, null, 2)}
				</pre>
			)}
			{!error && !data && <div>Loading...</div>}
		</div>
	);
}
