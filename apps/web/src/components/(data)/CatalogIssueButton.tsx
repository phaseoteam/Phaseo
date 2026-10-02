import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function CatalogIssueButton({ entity, id }: { entity: string; id: string }) {
	const t = useTranslations("Common");
	const query = new URLSearchParams({
		template: "incorrect-info.yml",
		area: "Data",
		title: `[Incorrect Info] ${entity}: ${id}`,
		incorrect: `${entity}: ${id}\n\n${t("ui.localisationGaps.issueQuestion")}`,
	});
	return (
		<Button variant="outline" size="sm" asChild>
			<a href={`https://github.com/phaseoteam/Phaseo/issues/new?${query}`} target="_blank" rel="noopener noreferrer">
				<MessageSquareWarning className="h-4 w-4" />
				{t("search.palette.items.resource-report-issue.title")}
			</a>
		</Button>
	);
}
