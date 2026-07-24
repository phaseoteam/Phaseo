import {
	capabilityIdToRoomId,
	filterModelsForRoom,
	roomIdsFromCapabilities,
} from "@/lib/chat/rooms";

describe("chat room capability mapping", () => {
	it("maps moderation and embeddings capabilities explicitly", () => {
		expect(capabilityIdToRoomId("moderations.create")).toBe("moderation");
		expect(capabilityIdToRoomId("text.moderate")).toBe("moderation");
		expect(capabilityIdToRoomId("text.embed")).toBe("embeddings");
		expect(capabilityIdToRoomId("audio.realtime")).toBe("realtime");
		expect(capabilityIdToRoomId("realtime")).toBe("realtime");
	});

	it("returns all distinct room ids from capabilities", () => {
		expect(
			roomIdsFromCapabilities([
				"text.generate",
				"images.generations",
				"moderation",
				"text.generate",
			]),
		).toEqual(["text", "image", "moderation"]);
	});

	it("filters models by room support", () => {
		const models = [
			{
				modelId: "openai/gpt-5",
				capabilities: ["text.generate"],
			},
			{
				modelId: "openai/gpt-image-1",
				capabilities: ["images.generations"],
			},
			{
				modelId: "openai/omni-embed",
				capabilities: ["text.embed"],
			},
			{
				modelId: "openai/gpt-realtime-2",
				capabilities: ["audio.realtime"],
			},
		];
		expect(filterModelsForRoom(models, "text")).toHaveLength(1);
		expect(filterModelsForRoom(models, "image")).toHaveLength(1);
		expect(filterModelsForRoom(models, "embeddings")).toHaveLength(1);
		expect(filterModelsForRoom(models, "realtime")).toHaveLength(1);
	});
});
