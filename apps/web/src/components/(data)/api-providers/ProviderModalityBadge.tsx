import type { LucideIcon } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { HoverCard, HoverCardContent, HoverCardHeader, HoverCardRows, HoverCardTrigger } from "@/components/ui/hover-card";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { cn } from "@/lib/utils";
import { DisplayNumber } from "@/components/display/DisplayValue";

type ProviderModalityBadgeProps = {
	label: string;
	modality: string;
	icon: LucideIcon;
	inputCount: number;
	outputCount: number;
};

export function ProviderModalityBadge({
	label,
	modality,
	icon: Icon,
	inputCount,
	outputCount,
}: ProviderModalityBadgeProps) {
	const tone = getModalityTone(modality);
	const t = useTranslations("Catalogue.providerModelList");

	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				{/* A button, so the surrounding provider card's click guard skips it. */}
				<button
					type="button"
					aria-label={label}
					className={cn(
						"inline-flex size-6 cursor-default items-center justify-center rounded-md p-0 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						tone.badgeClassName,
					)}
				>
					<Icon className={cn("size-3.5", tone.iconClassName)} />
				</button>
			</HoverCardTrigger>
			<HoverCardContent className="w-56 space-y-2.5">
				<HoverCardHeader icon={<Icon className={tone.iconClassName} />} title={label} />
				<HoverCardRows
					rows={[
						{ key: "input", label: t("input"), value: <DisplayNumber value={inputCount} /> },
						{ key: "output", label: t("output"), value: <DisplayNumber value={outputCount} /> },
					]}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
