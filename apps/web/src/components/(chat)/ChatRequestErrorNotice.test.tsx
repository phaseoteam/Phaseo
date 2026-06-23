import { renderToStaticMarkup } from "react-dom/server";
import {
	ChatRequestErrorNotice,
	normalizeChatRequestErrorDetails,
} from "./ChatRequestErrorNotice";

describe("ChatRequestErrorNotice", () => {
	test("normalizes malformed persisted error metadata", () => {
		expect(normalizeChatRequestErrorDetails({})).toEqual({
			status: null,
			message: "Request failed.",
			errorCode: null,
			requestId: null,
			description: null,
			details: [],
			routingDiagnostics: null,
			rawPayload: null,
			modelId: "unknown",
			providerId: null,
			endpoint: "unknown",
			timestamp: "",
		});
	});

	test("renders safely when imported error metadata is malformed", () => {
		expect(() =>
			renderToStaticMarkup(
				<ChatRequestErrorNotice
					error={{} as any}
				/>,
			),
		).not.toThrow();
	});
});
