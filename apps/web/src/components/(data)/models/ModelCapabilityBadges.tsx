import { useTranslations } from "next-intl";
import { MODEL_CAPABILITY_LABEL_KEYS, modelCapabilities } from "@/lib/models/modelCapabilities";
import { getModalityIcon } from "@/lib/models/modalityIcons";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";

export function useModelCapabilityLabel() {
	const t = useTranslations("Catalogue.models.filtersUi");
	return (capability: string) => {
		const key = MODEL_CAPABILITY_LABEL_KEYS[capability as keyof typeof MODEL_CAPABILITY_LABEL_KEYS];
		if (key) return t(key);
		const words = capability.replace(/[._/-]+/g, " ").trim();
		return words.charAt(0).toUpperCase() + words.slice(1);
	};
}

function capabilityStyleKey(capability: string): string {
	if (capability === "decisions.make") return "decisions";
	if (capability === "ocr" || capability === "parse") return "file";
	return capability;
}

export function ModelCapabilityBadges({ endpoints }: { endpoints: readonly string[] }) {
	const label = useModelCapabilityLabel();
	return <div className="flex flex-wrap items-center gap-1">
		{modelCapabilities(endpoints).map(capability => {
			const styleKey = capabilityStyleKey(capability);
			const Icon = capability === "batch" ? getTierFilterMeta("batch").icon : getModalityIcon(styleKey);
			const tone = getModalityTone(styleKey);
			return <span key={capability} title={capability}
				className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", tone.badgeClassName)}>
				<Icon className={cn("h-3 w-3", tone.iconClassName)} />
				{label(capability)}
			</span>;
		})}
	</div>;
}
