import {
	getVisibleEndpointRoutes,
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
