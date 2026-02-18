import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ModelEditButtonProps {
	modelId: string;
	tab?: string;
}

export default async function ModelEditButton({
	modelId,
	tab,
}: ModelEditButtonProps) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	let isAdmin = false;
	if (user) {
		const { data } = await supabase
			.from("users")
			.select("role")
			.eq("user_id", user.id)
			.single();
		isAdmin = data?.role === "admin";
	}

	if (!isAdmin) {
		return null;
	}

	const href = tab
		? `/internal/data/models/edit/${modelId}?tab=${encodeURIComponent(tab)}`
		: `/internal/data/models/edit/${modelId}`;

	return (
		<Button variant="outline" size="icon-sm" asChild>
			<Link href={href} aria-label="Edit model">
				<Pencil className="h-4 w-4" />
			</Link>
		</Button>
	);
}
