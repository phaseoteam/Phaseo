import {
	Text,
	Image,
	Video,
	Captions,
	Headphones,
	Music4,
	Speech,
	Scale,
	Braces,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { getTranslations } from "next-intl/server";

interface Modality {
	key: string;
	translationKey:
		| "modalityText"
		| "modalityImage"
		| "modalityVideo"
		| "modalityAudio"
		| "modalitySpeech"
		| "modalityTranscription"
		| "modalityMusic"
		| "modalityStructured"
		| "modalityDecisions";
	icon: LucideIcon;
}

interface ModalitiesProps {
	inputTypes: string[];
	outputTypes: string[];
}

const MODALITIES: Modality[] = [
	{ key: "text", translationKey: "modalityText", icon: Text },
	{ key: "image", translationKey: "modalityImage", icon: Image },
	{ key: "video", translationKey: "modalityVideo", icon: Video },
	{ key: "audio", translationKey: "modalityAudio", icon: Headphones },
	{ key: "audio_tts", translationKey: "modalitySpeech", icon: Speech },
	{ key: "audio_stt", translationKey: "modalityTranscription", icon: Captions },
	{ key: "audio_music", translationKey: "modalityMusic", icon: Music4 },
	{ key: "structured", translationKey: "modalityStructured", icon: Braces },
	{ key: "decisions", translationKey: "modalityDecisions", icon: Scale },
];

export default async function Modalities({
	inputTypes,
	outputTypes,
}: ModalitiesProps) {
	const t = await getTranslations("Catalogue.modelDetail.metadata");
	const inputModalities = MODALITIES.filter((mod) => inputTypes.includes(mod.key));
	const outputModalities = MODALITIES.filter((mod) => outputTypes.includes(mod.key));

	return (
		<div className="flex flex-col h-full">
			<h2 className="text-xl font-semibold mb-4">{t("modalities")}</h2>
			<div className="grid grid-cols-2 gap-4 mb-6 flex-1 h-full">
				{/* Input Modalities Card */}
				<div className="p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg h-full">
					<div className="flex flex-wrap gap-2 justify-center mb-1">
						{inputModalities.length > 0 ? inputModalities.map((mod) => {
							const Icon = mod.icon;
							const tone = getModalityTone(mod.key);
							return (
								<span
									key={mod.key + "-input"}
									className={cn(
										"flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors duration-150",
										tone.badgeClassName,
									)}
								>
									<Icon
										size={16}
										className={cn("inline-block", tone.iconClassName)}
									/>
									{t(mod.translationKey)}
								</span>
							);
						}) : (
							<span className="text-xs text-muted-foreground">{t("noModalities")}</span>
						)}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						{t("input")}
					</span>
				</div>
				{/* Output Modalities Card */}
				<div className="p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg h-full">
					<div className="flex flex-wrap gap-2 justify-center mb-1">
						{outputModalities.length > 0 ? outputModalities.map((mod) => {
							const Icon = mod.icon;
							const tone = getModalityTone(mod.key);
							return (
								<span
									key={mod.key + "-output"}
									className={cn(
										"flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors duration-150",
										tone.badgeClassName,
									)}
								>
									<Icon
										size={16}
										className={cn("inline-block", tone.iconClassName)}
									/>
									{t(mod.translationKey)}
								</span>
							);
						}) : (
							<span className="text-xs text-muted-foreground">{t("noModalities")}</span>
						)}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						{t("output")}
					</span>
				</div>
			</div>
		</div>
	);
}
