import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { MODEL_CAPABILITY_LABEL_KEYS, modelCapabilities } from "@/lib/models/modelCapabilities";
import { getModalityIcon } from "@/lib/models/modalityIcons";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";

// Shared by the table's capability, modality and feature icons: a tinted,
// borderless rounded square, as the model cards use for modality badges.
export const MODEL_ICON_BADGE_CLASS_NAME =
	"inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

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

export function getCapabilityIconMeta(capability: string): {
	icon: LucideIcon;
	tone: ReturnType<typeof getModalityTone>;
} {
	const styleKey = capabilityStyleKey(capability);
	return {
		icon: capability === "batch" ? getTierFilterMeta("batch").icon : getModalityIcon(styleKey),
		tone: getModalityTone(styleKey),
	};
}

export function ModelCapabilityIcons({ endpoints }: { endpoints: readonly string[] }) {
	const label = useModelCapabilityLabel();
	return <div className="flex flex-wrap items-center gap-1">
		{modelCapabilities(endpoints).map(capability => {
			const { icon: Icon, tone } = getCapabilityIconMeta(capability);
			const capabilityLabel = label(capability);
			return <Tooltip key={capability}>
				<TooltipTrigger asChild>
					<span role="img" tabIndex={0} aria-label={capabilityLabel}
						className={cn(MODEL_ICON_BADGE_CLASS_NAME, tone.badgeClassName)}>
						<Icon aria-hidden className={cn("h-3.5 w-3.5", tone.iconClassName)} />
					</span>
				</TooltipTrigger>
				<TooltipContent side="top">{capabilityLabel}</TooltipContent>
			</Tooltip>;
		})}
	</div>;
}
