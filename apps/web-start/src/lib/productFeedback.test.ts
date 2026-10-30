import {
	PRODUCT_FEEDBACK_EVENT,
	captureProductFeedback,
	type ProductFeedbackPayload,
} from "./productFeedback";

jest.mock("@/lib/clientErrorReporting", () => ({
	isAnalyticsCaptureAllowed: jest.fn(() => true),
}));

describe("captureProductFeedback", () => {
	it("dispatches trimmed, contextual feedback for PostHog ingestion", () => {
		const browserWindow = new EventTarget() as EventTarget & {
			location: { pathname: string; search: string };
		};
		browserWindow.location = { pathname: "/settings/broadcast", search: "" };
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: browserWindow,
		});

		let received: ProductFeedbackPayload | null = null;
		browserWindow.addEventListener(PRODUCT_FEEDBACK_EVENT, (event) => {
			received = (event as CustomEvent<ProductFeedbackPayload>).detail;
		});

		expect(captureProductFeedback({
			surface: "settings_broadcast",
			category: "idea",
			reason: "missing_capability",
			message: "  Add another destination  ",
		})).toBe(true);
		expect(received).toEqual({
			action: "sent",
			surface: "settings_broadcast",
			category: "idea",
			reason: "missing_capability",
			message: "Add another destination",
			path: "/settings/broadcast",
		});

		Reflect.deleteProperty(globalThis, "window");
	});
});
