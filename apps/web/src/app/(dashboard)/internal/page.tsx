import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import InternalToolsGrid from "@/components/internal/InternalToolsGrid";

export const metadata = {
	title: "Internal Tools",
	description: "Admin tools and utilities for managing the AI Stats platform",
};

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

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-2">Internal Tools</h1>
					<p className="text-muted-foreground">
						Admin tools and utilities for managing the AI Stats platform.
					</p>
				</div>
				<InternalToolsGrid />
			</div>
		</main>
	);
}
