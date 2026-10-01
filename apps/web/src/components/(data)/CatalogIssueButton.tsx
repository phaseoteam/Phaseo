import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CatalogIssueButton({ entity, id }: { entity: string; id: string }) {
	const query = new URLSearchParams({
		template: "incorrect-info.yml",
		area: "Data",
		title: `[Incorrect Info] ${entity}: ${id}`,
		incorrect: `${entity}: ${id}\n\nWhat is incorrect?`,
	});
	return (
		<Button variant="outline" size="sm" asChild>
			<a href={`https://github.com/phaseoteam/Phaseo/issues/new?${query}`} target="_blank" rel="noopener noreferrer">
				<MessageSquareWarning className="h-4 w-4" />
				Report an issue
			</a>
		</Button>
	);
}
