import {
	getRecentApiFailures,
	getSanitizedLocationContext,
	recordApiFailure,
	resetErrorReproductionContextForTests,
} from "@/lib/errorReproductionContext";

describe("error reproduction context", () => {
	beforeEach(() => {
		resetErrorReproductionContextForTests();
	});

	it("captures route and query names without query values", () => {
		const context = getSanitizedLocationContext(
			"https://phaseo.app/settings/keys/key_123?tab=limits&token=secret",
		);

		expect(context).toEqual({
			path: "/settings/keys/key_123",
			queryKeys: ["tab", "token"],
			referrerPath: null,
		});
		expect(JSON.stringify(context)).not.toContain("secret");
	});

	it("keeps only the five most recent API failures", () => {
		for (let index = 0; index < 7; index += 1) {
			recordApiFailure({
				method: "GET",
				path: `/api/${index}`,
				requestId: `req_${index}`,
				status: 500,
				timestamp: "2026-09-01T00:00:00.000Z",
			});
		}

		expect(getRecentApiFailures().map((failure) => failure.requestId)).toEqual([
			"req_2",
			"req_3",
			"req_4",
			"req_5",
			"req_6",
		]);
	});
});
