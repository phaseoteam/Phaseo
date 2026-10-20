import {
	getVisibleEndpointRoutes,
	getSupportedEndpointOptions,
	type EndpointRoute,
} from "./endpointRoutes";

const ROUTES: EndpointRoute[] = [
	{
		value: "responses",
		method: "POST",
		path: "/v1/responses",
		title: "Responses",
		description: "Responses API",
		tag: "Recommended",
	},
	{
		value: "chat.completions",
		method: "POST",
		path: "/v1/chat/completions",
		title: "Chat Completions",
		description: "Chat Completions API",
		tag: "Compatible",
	},
	{
		value: "messages",
		method: "POST",
		path: "/v1/messages",
		title: "Messages",
		description: "Messages API",
		tag: "Compatible",
	},
	{
		value: "embeddings",
		method: "POST",
		path: "/v1/embeddings",
		title: "Embeddings",
		description: "Embeddings API",
		tag: "Recommended",
	},
	{
		value: "audio.transcriptions",
		method: "POST",
		path: "/v1/audio/transcriptions",
		title: "Audio Transcription",
		description: "Audio transcription API",
		tag: "Recommended",
	},
];

describe("model endpoint compatibility", () => {
	test("only offers extraction for Clairic, even with an incompatible preference", () => {
		expect(getSupportedEndpointOptions(["extraction.extract"], "chat.completions"))
			.toEqual([{ value: "extractions", label: "Extractions" }]);
	});
	test("does not offer unrelated endpoints for unknown or missing support", () => {
		expect(getSupportedEndpointOptions(["future.capability"])).toEqual([]);
		expect(getSupportedEndpointOptions([])).toEqual([]);
	});
	test("maps text capabilities to the supported compatibility protocols", () => {
		expect(getSupportedEndpointOptions(["text.generate"]).map((option) => option.value))
			.toEqual(["responses", "chat.completions", "messages"]);
	});
	test("preserves explicit endpoint support and legacy preferred endpoint metadata", () => {
		expect(getSupportedEndpointOptions(["/v1/extractions"]).map((option) => option.value)).toEqual(["extractions"]);
		expect(getSupportedEndpointOptions([], "decisions.make").map((option) => option.value)).toEqual(["decisions"]);
		expect(getSupportedEndpointOptions(["/embeddings"]).map((option) => option.value)).toEqual(["embeddings"]);
	});
	test("preserves endpoint-valued capabilities alongside their expanded paths", () => {
		expect(getSupportedEndpointOptions(["music.generate"]).map((option) => option.value)).toEqual(["music.generate"]);
		expect(getSupportedEndpointOptions(["batch.create"]).map((option) => option.value)).toEqual(["batch.create"]);
	});
});

describe("getVisibleEndpointRoutes", () => {
	test("keeps the selected endpoint visible in collapsed mode", () => {
		const visibleRoutes = getVisibleEndpointRoutes(
			ROUTES,
			"audio.transcriptions",
			false,
		);

		expect(visibleRoutes.map((route) => route.value)).toEqual([
			"responses",
			"chat.completions",
			"messages",
			"audio.transcriptions",
		]);
	});

	test("returns the full list when expanded", () => {
		const visibleRoutes = getVisibleEndpointRoutes(
			ROUTES,
			"audio.transcriptions",
			true,
		);

		expect(visibleRoutes).toEqual(ROUTES);
	});
});
