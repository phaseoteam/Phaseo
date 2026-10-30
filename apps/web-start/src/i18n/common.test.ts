import englishCommonMessages from "../../messages/en-GB/common.json";
import germanCommonMessages from "../../messages/de-DE/common.json";

function flatten(value: unknown, prefix = "", result: Record<string, string> = {}) {
	if (typeof value === "string") {
		result[prefix] = value;
		return result;
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		flatten(child, prefix ? `${prefix}.${key}` : key, result);
	}
	return result;
}

describe("shared common catalogs", () => {
	it("keeps German common UI structurally complete", () => {
		const source = flatten(englishCommonMessages);
		const german = flatten(germanCommonMessages);

		expect(Object.keys(german).sort()).toEqual(Object.keys(source).sort());
		for (const [key] of Object.entries(source)) {
			expect(german[key]).toBeTruthy();
		}
		expect(german["nav.models"]).not.toBe(source["nav.models"]);
		expect(german["footer.spottedIssue"]).not.toBe(source["footer.spottedIssue"]);
		expect(german["search.noResults"]).not.toBe(source["search.noResults"]);
	});

	it("preserves interpolation arguments", () => {
		for (const key of [
			"search.unpin",
			"search.pin",
			"search.pressShortcut",
			"search.switchedWorkspace",
			"search.failedSwitchWorkspace",
			"status.openPage",
			"status.expectedCompletion",
			"status.minuteRemaining",
			"status.hourRemaining",
			"status.hoursRemaining",
			"theme.use",
			"theme.set",
		]) {
			const sourceArgs = (flatten(englishCommonMessages)[key].match(/\{[^}]+\}/g) ?? []).sort();
			const germanArgs = (flatten(germanCommonMessages)[key].match(/\{[^}]+\}/g) ?? []).sort();
			expect(germanArgs).toEqual(sourceArgs);
		}
	});
});
