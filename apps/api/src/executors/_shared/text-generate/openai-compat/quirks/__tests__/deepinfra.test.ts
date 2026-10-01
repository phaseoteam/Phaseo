import { describe, expect, it } from "vitest";
import { deepInfraQuirks } from "../../providers/deepinfra/quirks";
import { irToOpenAIChat } from "../../transform-chat";

describe("DeepInfra quirks", () => {
	it("maps gateway video parts to DeepInfra's video_url content type", () => {
		const request = irToOpenAIChat({
			model: "inclusionai/ling-3.0-flash-vl",
			stream: false,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Summarize this clip." },
					{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
				],
			}],
		} as any, "inclusionAI/Ling-3.0-flash-VL", "deepinfra");

		deepInfraQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.messages[0].content[1]).toEqual({
			type: "video_url",
			video_url: { url: "https://example.com/clip.mp4" },
		});
	});
});
