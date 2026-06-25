import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

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
		playground: "providers",
		family: "basic",
		timeline: "basic",
		benchmarks: "benchmarks",
		plans: "plans",
		providers: "providers",
		pricing: "pricing",
		quickstart: "providers",
		performance: "providers",
		apps: "providers",
		activity: "providers",
		basic: "basic",
		details: "details",
	};

	return map[normalized] ?? "basic";
}

export default async function ModelEditButton({
	modelId,
	tab,
}: ModelEditButtonProps) {
	const authStatus = await fetchInternalAuthStatus().catch(() => ({
		isAdmin: false,
		signedIn: false,
	}));

	if (!authStatus.isAdmin) {
		return null;
	}

	const editorTab = mapPageTabToEditorTab(tab);
	const href = editorTab
		? `/internal/data/models/edit/${modelId}?tab=${encodeURIComponent(editorTab)}`
		: `/internal/data/models/edit/${modelId}`;

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="mt-1 h-6 w-6 shrink-0 rounded-sm p-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
			asChild
		>
			<Link href={href} aria-label="Edit model">
				<Pencil className="h-2.5 w-2.5" />
			</Link>
		</Button>
	);
}
