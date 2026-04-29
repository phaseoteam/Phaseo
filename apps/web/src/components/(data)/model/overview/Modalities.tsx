import {
	Text,
	Image,
	Video,
	Captions,
	Headphones,
	Music4,
	Speech,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";

interface Modality {
	key: string;
	label: string;
	icon: LucideIcon;
}

interface ModalitiesProps {
	inputTypes: string[];
	outputTypes: string[];
}

const MODALITIES: Modality[] = [
	{ key: "text", label: "Text", icon: Text },
	{ key: "image", label: "Image", icon: Image },
	{ key: "video", label: "Video", icon: Video },
	{ key: "audio", label: "Audio", icon: Headphones },
	{ key: "audio_tts", label: "Speech", icon: Speech },
	{ key: "audio_stt", label: "Transcription", icon: Captions },
	{ key: "audio_music", label: "Music", icon: Music4 },
];

export default function Modalities({
	inputTypes,
	outputTypes,
}: ModalitiesProps) {
	const inputModalities = MODALITIES.filter((mod) => inputTypes.includes(mod.key));
	const outputModalities = MODALITIES.filter((mod) => outputTypes.includes(mod.key));

	return (
		<div className="flex flex-col h-full">
			<h2 className="text-xl font-semibold mb-4">Modalities</h2>
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
									{mod.label}
								</span>
							);
						}) : (
							<span className="text-xs text-muted-foreground">No modalities listed.</span>
						)}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						Input
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
									{mod.label}
								</span>
							);
						}) : (
							<span className="text-xs text-muted-foreground">No modalities listed.</span>
						)}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						Output
					</span>
				</div>
			</div>
		</div>
	);
}
