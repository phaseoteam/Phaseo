import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/react";

export function CatalogIssueButton({ entity, id, compactMobile = false }: { entity: string; id: string; compactMobile?: boolean }) {
	const t = useTranslations("Common");
	const query = new URLSearchParams({
		template: "incorrect-info.yml",
		area: "Data",
		title: `[Incorrect Info] ${entity}: ${id}`,
		incorrect: `${entity}: ${id}\n\n${t("ui.localisationGaps.issueQuestion")}`,
	});
	return (
		<Button variant="outline" size="sm" asChild>
			<a href={`https://github.com/phaseoteam/Phaseo/issues/new?${query}`} target="_blank" rel="noopener noreferrer" aria-label={t("search.palette.items.resource-report-issue.title")}>
				<MessageSquareWarning className="h-4 w-4" />
				<span className={compactMobile ? "sr-only sm:not-sr-only" : undefined}>{t("search.palette.items.resource-report-issue.title")}</span>
			</a>
		</Button>
	);
}
