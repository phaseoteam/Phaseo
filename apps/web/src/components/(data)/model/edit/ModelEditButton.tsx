import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ModelEditButtonProps {
	modelId: string;
	tab?: string;
}

function mapPageTabToEditorTab(tab: string | undefined): string | null {
	if (!tab) return null;
	const normalized = tab.trim().toLowerCase();
	if (!normalized) return null;

	const map: Record<string, string> = {
		overview: "basic",
		family: "basic",
		timeline: "basic",
		benchmarks: "benchmarks",
		providers: "providers",
		pricing: "pricing",
		quickstart: "providers",
		performance: "providers",
		basic: "basic",
		details: "details",
	};

	return map[normalized] ?? "basic";
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

	const editorTab = mapPageTabToEditorTab(tab);
	const href = editorTab
		? `/internal/data/models/edit/${modelId}?tab=${encodeURIComponent(editorTab)}`
		: `/internal/data/models/edit/${modelId}`;

	return (
		<Button variant="outline" size="icon-sm" asChild>
			<Link href={href} aria-label="Edit model">
				<Pencil className="h-4 w-4" />
			</Link>
		</Button>
	);
}
