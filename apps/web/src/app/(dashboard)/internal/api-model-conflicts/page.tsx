import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { buildApiModelConflictsSnapshot } from "@/lib/internal/apiModelConflicts";
import ApiModelConflictsClient from "./ApiModelConflictsClient";

export const metadata = {
	title: "API Model Conflicts - Internal",
	description:
		"Inspect provider API model IDs, detect likely alias conflicts, and find pricing mismatches between model IDs and pricing directories.",
};

export default async function ApiModelConflictsPage() {
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

	const snapshot = buildApiModelConflictsSnapshot();
	return <ApiModelConflictsClient snapshot={snapshot} />;
}
