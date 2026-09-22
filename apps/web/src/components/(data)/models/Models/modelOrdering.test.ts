import { compareModelsByNewest } from "./modelOrdering";
import type { ModelsPageModel } from "./modelsDisplay.types";

describe("compareModelsByNewest", () => {
	it("keeps the API availability order when lifecycle dates tie", () => {
		const models = [
			{ model_id: "upstage/solar-mini-4", primary_timestamp: 1_790_035_200_000 },
			{ model_id: "xiaomi/mimo-v2.6-flash", primary_timestamp: 1_789_948_800_000 },
			{ model_id: "spacex-ai/grok-4.7", primary_timestamp: 1_789_948_800_000 },
		] as ModelsPageModel[];

		expect(models.sort(compareModelsByNewest).map((model) => model.model_id)).toEqual([
			"upstage/solar-mini-4",
			"xiaomi/mimo-v2.6-flash",
			"spacex-ai/grok-4.7",
		]);
	});
});
