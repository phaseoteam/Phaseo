import { noticeStackVariables } from "./noticeStack";

describe("notice stack", () => {
	it("stacks the deprecation notice below the site notice and totals both", () => {
		expect(noticeStackVariables({ site: 36, deprecation: 44 })).toEqual({
			"--site-notice-top": "0px",
			"--site-notice-bar-height": "36px",
			"--deprecation-notice-top": "36px",
			"--deprecation-notice-bar-height": "44px",
			"--site-notice-height": "80px",
		});
	});

	it("collapses to zero when bars are hidden or dismissed", () => {
		expect(noticeStackVariables({ deprecation: 44 })["--deprecation-notice-top"]).toBe("0px");
		expect(noticeStackVariables({ site: 36, deprecation: 0 })["--site-notice-height"]).toBe("36px");
		expect(noticeStackVariables({})["--site-notice-height"]).toBe("0px");
	});
});
