import {
	getFooterVisibilitySnapshot,
	registerHideFooter,
	registerShowFooter,
	subscribeFooterVisibility,
} from "./footerVisibility";

describe("footer visibility overrides", () => {
	it("supports nested hide and show overrides with idempotent cleanup", () => {
		const listener = jest.fn();
		const unsubscribe = subscribeFooterVisibility(listener);
		const removeHide = registerHideFooter();

		expect(getFooterVisibilitySnapshot()).toBe(false);

		const removeShow = registerShowFooter();
		expect(getFooterVisibilitySnapshot()).toBe(true);

		removeShow();
		expect(getFooterVisibilitySnapshot()).toBe(false);

		removeHide();
		removeHide();
		expect(getFooterVisibilitySnapshot()).toBe(true);
		expect(listener).toHaveBeenCalledTimes(4);

		unsubscribe();
	});
});
