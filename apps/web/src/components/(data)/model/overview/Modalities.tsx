import {
	Text,
	Image,
	AudioLines,
	Video,
	Mic,
	Volume2,
	Music2,
	type LucideIcon,
} from "lucide-react";

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
	{ key: "audio_stt", label: "STT", icon: Mic },
	{ key: "audio_tts", label: "TTS", icon: Volume2 },
	{ key: "audio_music", label: "Music", icon: Music2 },
	{ key: "audio", label: "Audio", icon: AudioLines },
	{ key: "video", label: "Video", icon: Video },
];

export default function Modalities({
	inputTypes,
	outputTypes,
}: ModalitiesProps) {
	return (
		<div className="flex flex-col h-full">
			<h2 className="text-xl font-semibold mb-4">Modalities</h2>
			<div className="grid grid-cols-2 gap-4 mb-6 flex-1 h-full">
				{/* Input Modalities Card */}
				<div className="p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg h-full">
					<div className="flex flex-wrap gap-2 justify-center mb-1">
						{MODALITIES.map((mod) => {
							const Icon = mod.icon;
							const enabled = inputTypes.includes(mod.key);
							return (
								<span
									key={mod.key + "-input"}
									className={`px-2 py-1 rounded text-xs font-semibold border flex items-center gap-1 transition-colors duration-150 ${
										enabled
											? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
											: "bg-red-50 dark:bg-red-950 text-red-400 border-red-200 dark:border-red-800 opacity-60"
									}`}
								>
									<Icon size={16} className="inline-block" />
									{mod.label}
								</span>
							);
						})}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						Input
					</span>
				</div>
				{/* Output Modalities Card */}
				<div className="p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg h-full">
					<div className="flex flex-wrap gap-2 justify-center mb-1">
						{MODALITIES.map((mod) => {
							const Icon = mod.icon;
							const enabled = outputTypes.includes(mod.key);
							return (
								<span
									key={mod.key + "-output"}
									className={`px-2 py-1 rounded text-xs font-semibold border flex items-center gap-1 transition-colors duration-150 ${
										enabled
											? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
											: "bg-red-50 dark:bg-red-950 text-red-400 border-red-200 dark:border-red-800 opacity-60"
									}`}
								>
									<Icon size={16} className="inline-block" />
									{mod.label}
								</span>
							);
						})}
					</div>
					<span className="text-xs font-medium text-gray-500 mt-1">
						Output
					</span>
				</div>
			</div>
		</div>
	);
}
