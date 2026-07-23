import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

type WeeklyUsageSource = Pick<
	ModelCard,
	| "gateway_input_modalities"
	| "gateway_output_modalities"
	| "popularity_tokens_week"
	| "weekly_usage_metric"
	| "weekly_usage_quantity"
>;

export type WeeklyUsageDisplay = {
	label: string;
	quantity: number;
	unitSuffix: string;
};

function finiteQuantity(value: unknown): number | null {
	const quantity = Number(value);
	return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

export function resolveWeeklyUsageDisplay(model: WeeklyUsageSource): WeeklyUsageDisplay {
	const metric = String(model.weekly_usage_metric ?? "").trim().toLowerCase();
	const quantity = finiteQuantity(model.weekly_usage_quantity)
		?? finiteQuantity(model.popularity_tokens_week)
		?? 0;

	if (metric === "video_seconds") {
		return {
			label: "Video hours generated",
			quantity: quantity / 3_600,
			unitSuffix: "h",
		};
	}

	if (metric === "audio_seconds") {
		const hasAudioInput = (model.gateway_input_modalities ?? []).some((value) =>
			String(value).toLowerCase().includes("audio"),
		);
		const hasTextOutput = (model.gateway_output_modalities ?? []).some((value) =>
			String(value).toLowerCase().includes("text"),
		);
		return {
			label: hasAudioInput && hasTextOutput
				? "Transcription seconds"
				: "Audio seconds",
			quantity,
			unitSuffix: "s",
		};
	}

	if (metric === "images") {
		return { label: "Images generated", quantity, unitSuffix: "" };
	}

	if (metric === "characters") {
		return { label: "Characters processed", quantity, unitSuffix: "" };
	}

	if (metric === "requests") {
		return { label: "Weekly requests", quantity, unitSuffix: "" };
	}

	return { label: "Weekly tokens", quantity, unitSuffix: "" };
}
