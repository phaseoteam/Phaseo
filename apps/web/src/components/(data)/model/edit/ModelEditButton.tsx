import Link from "@/components/link";
import { CatalogIssueButton } from "@/components/(data)/CatalogIssueButton";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogueInternalAuthStatusQuery } from "@/components/(data)/catalogueViewer.functions";
import { useTranslations } from "@/i18n/react";

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

export default function ModelEditButton({
	modelId,
	tab,
}: ModelEditButtonProps) {
	const { data: authStatus } = useSuspenseQuery(catalogueInternalAuthStatusQuery());
	const tEditor = useTranslations("Common.ui.modelEditor");

	if (!authStatus.isAdmin) {
		return <CatalogIssueButton entity="Model" id={modelId} />;
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
			<Link href={href} aria-label={tEditor("dialogTitle")}>
				<Pencil className="h-2.5 w-2.5" />
			</Link>
		</Button>
	);
}
