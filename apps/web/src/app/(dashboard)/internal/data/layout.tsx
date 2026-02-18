import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function InternalDataLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		redirect("/sign-in");
	}

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		redirect("/internal");
	}

	return <>{children}</>;
}
