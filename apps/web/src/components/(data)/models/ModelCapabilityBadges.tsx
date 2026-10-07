import { useTranslations } from "next-intl";
import { decisionModelCapabilities } from "@/lib/models/modelCapabilities";
import { getModalityTone } from "@/lib/models/modalityStyles";

export function ModelCapabilityBadges({ endpoints }: { endpoints: readonly string[] }) {
	const t = useTranslations("Catalogue.models.filtersUi");
	return <div className="flex flex-wrap items-center gap-1">
		{decisionModelCapabilities(endpoints).map(capability => <span key={capability}
			className={`inline-flex rounded-md px-2 py-0.5 text-[11px] ${getModalityTone(capability === "text.generate" ? "text" : "decisions").badgeClassName}`}>
			{t(capability === "text.generate" ? "capabilityTextGeneration" : "modalityDecisions")}
		</span>)}
	</div>;
}
