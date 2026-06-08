import KeyDates from "./KeyDates";
import Performance from "./Performance";
// Pricing temporarily disabled while upgrading
// import Pricing from "./Pricing";
import Modalities from "./Modalities";
import OtherInfo from "./OtherInfo";
import ModelLinks, { hasModelLinks } from "./ModelLinks";
import ModelStatusBanner from "./ModelStatusBanner";
import { ModelOverviewPage } from "@/lib/fetchers/models/getModel";

export interface ModelOverviewProps {
	model: ModelOverviewPage;
}

export default function ModelOverview({ model }: ModelOverviewProps) {
	// Modalities logic: always show Text, Image, Audio, Video
	const parseTypes = (types: any) => {
		const normalizeType = (raw: unknown): string => {
			const value = String(raw ?? "")
				.trim()
				.toLowerCase()
				.replace(/[._/-]+/g, " ");
			if (!value) return "";
			if (value.includes("music")) return "audio_music";
			if (
				value.includes("transcrib") ||
				value.includes("speech to text") ||
				value.includes("stt")
			) {
				return "audio_stt";
			}
			if (
				value.includes("text to speech") ||
				value.includes("audio speech") ||
				value.includes("speech synth") ||
				value.includes("tts")
			) {
				return "audio_tts";
			}
			return value.replace(/\s+/g, "_");
		};

		if (Array.isArray(types))
			return Array.from(new Set(types.map((t: any) => normalizeType(t)).filter(Boolean)));
		if (typeof types === "string")
			return Array.from(
				new Set(
					types
						.split(",")
						.map((t) => normalizeType(t))
						.filter(Boolean),
				),
			);
		return [];
	};
	const inputTypes = parseTypes(model.input_types);
	const outputTypes = parseTypes(model.output_types);

	return (
		<div className="w-full mx-auto space-y-4">
			{/* Status banner */}
			{model.status && <ModelStatusBanner status={model.status} />}
			{/* Links section (hidden when there are no links) */}
			{hasModelLinks(model) && (
				<div>
					<h2 className="text-xl font-semibold mb-2">Links</h2>
					<ModelLinks model={model} />
				</div>
			)}

			{/* Key dates + Performance (stacked) */}
			<div className="space-y-4">
				<KeyDates
					announced={model.announcement_date ?? undefined}
					released={model.release_date ?? undefined}
					deprecated={model.deprecation_date ?? undefined}
					retired={model.retirement_date ?? undefined}
				/>
				<Performance details={model.model_details} />
			</div>

			{/* Modalities & Other Info in 2-col grid */}
			<section>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Modalities
							inputTypes={inputTypes}
							outputTypes={outputTypes}
						/>
					</div>
					<div>
						<OtherInfo details={model.model_details ?? undefined} />
					</div>
				</div>
			</section>

			{/* Pricing temporarily removed while upgrading */}
		</div>
	);
}
