import { runInNewContext } from "node:vm";
import { HISTORY_PRIVACY_SCRIPT } from "./historyPrivacyScript";

describe("pre-paint history response guard", () => {
	function execute(type?: string) {
		const setProperty = jest.fn();
		const reload = jest.fn(() => {
			expect(setProperty).toHaveBeenCalledWith("display", "none", "important");
		});
		runInNewContext(HISTORY_PRIVACY_SCRIPT, {
			performance: { getEntriesByType: () => type ? [{ type }] : [] },
			document: { documentElement: { style: { setProperty } } },
			window: { location: { reload } },
		});
		return { setProperty, reload };
	}

	it("hides replayed HTML before reloading with current authentication", () => {
		expect(execute("back_forward").reload).toHaveBeenCalledTimes(1);
	});

	it.each(["navigate", "reload", undefined])("leaves %s loads alone without a reload loop", (type) => {
		const { setProperty, reload } = execute(type);
		expect(setProperty).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});
});
