import { getChatRequestErrorPresentation } from "./chatRequestErrorPresentation";

function error(status: number | null, errorCode: string | null = null) {
	return {
		status,
		errorCode,
		message: "Gateway detail",
		description: null,
		details: [],
	};
}

describe("getChatRequestErrorPresentation", () => {
	it.each([
		[402, "payment", "titles.addCredits"],
		[401, "authentication", "titles.signInAgain"],
		[400, "validation", "titles.requestNeedsChange"],
		[403, "forbidden", "titles.requestNotAllowed"],
		[404, "model-unavailable", "titles.modelUnavailable"],
		[408, "timeout", "titles.requestTimedOut"],
		[409, "conflict", "titles.requestConflict"],
		[429, "rate-limit", "titles.modelBusy"],
		[503, "service", "titles.temporarilyUnavailable"],
	] as const)("maps HTTP %i to %s", (status, kind, titleKey) => {
		const presentation = getChatRequestErrorPresentation(error(status));

		expect(presentation).toMatchObject({ kind, titleKey });
	});

	it("recognizes streamed errors without an HTTP status", () => {
		expect(
			getChatRequestErrorPresentation(error(null, "RESOURCE_EXHAUSTED")),
		).toMatchObject({ kind: "rate-limit", canRetry: true });
		expect(
			getChatRequestErrorPresentation(error(null, "model_not_found")),
		).toMatchObject({ kind: "model-unavailable", canChooseModel: true });
	});

	it("does not present missing model pricing as a low balance", () => {
		expect(
			getChatRequestErrorPresentation(error(402, "pricing_not_configured")),
		).toMatchObject({
			kind: "model-unavailable",
			canChooseModel: true,
		});
	});

	it("leaves validation detail to the caller", () => {
		const presentation = getChatRequestErrorPresentation({
			...error(422),
			description: "Temperature must be below 1.",
		});

		expect(presentation.descriptionKey).toBeNull();
	});
});
