import { resolveWeeklyUsageDisplay } from "./weeklyUsage";

describe("resolveWeeklyUsageDisplay", () => {
	it("shows generated video time in hours", () => {
		expect(resolveWeeklyUsageDisplay({
			weekly_usage_metric: "video_seconds",
			weekly_usage_quantity: 7_200,
		})).toEqual({
			label: "Video hours generated",
			quantity: 2,
			unitSuffix: "h",
		});
	});

	it("labels audio-input text-output models as transcription", () => {
		expect(resolveWeeklyUsageDisplay({
			weekly_usage_metric: "audio_seconds",
			weekly_usage_quantity: 95,
			gateway_input_modalities: ["audio"],
			gateway_output_modalities: ["text"],
		})).toMatchObject({
			label: "Transcription seconds",
			quantity: 95,
			unitSuffix: "s",
		});
	});

	it("falls back to weekly tokens for the compatibility response", () => {
		expect(resolveWeeklyUsageDisplay({
			popularity_tokens_week: 12_345,
		})).toEqual({
			label: "Weekly tokens",
			quantity: 12_345,
			unitSuffix: "",
		});
	});
});
