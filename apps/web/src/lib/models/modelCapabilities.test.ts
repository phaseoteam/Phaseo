import { decisionModelCapabilities } from "./modelCapabilities";
import { filterModelsForRoom } from "@/lib/chat/rooms";

describe("models with Text generation and Decisions", () => {
	it("deduplicates protocol aliases without conflating image inputs with capabilities", () => {
		expect(decisionModelCapabilities(["text.generate", "/v1/responses", "chat/completions", "/decisions", "decisions.make", "image"]))
			.toEqual(["text.generate", "decisions.make"]);
		expect(decisionModelCapabilities(["image.generate"])).toEqual([]);
	});
	it("keeps the same Luna identity in both playground pickers", () => {
		const luna = { modelId: "openai/gpt-6-luna", capabilities: ["text.generate", "decisions.make"], outputModalities: ["text"] };
		expect(filterModelsForRoom([luna], "text")).toEqual([luna]);
		expect(filterModelsForRoom([luna], "decisions")).toEqual([luna]);
	});
});
