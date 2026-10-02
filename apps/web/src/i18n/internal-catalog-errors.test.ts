import { localizedInternalCatalogError } from "./internal-catalog-errors";
import { WebApiError } from "@/lib/web-api/client";

const translate = Object.assign((key: never) => `localized:${key}`, { has: () => true });
const prefix = "Common.ui.pricingEditorCopy.";

describe("localized internal catalog failures", () => {
	beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
	afterEach(() => jest.restoreAllMocks());
	it.each([[401, "signInToContinue"], [403, "noPermission"], [400, "checkRecordValues"]])("translates API status %s without displaying backend prose", (status, key) => {
		expect(localizedInternalCatalogError(new WebApiError("/catalog", status, "Raw English server detail"), translate, prefix + "saveFailed")).toBe(`localized:${prefix}${key}`);
	});
	it("preserves explicitly reviewed local validation messages", () => {
		const key = prefix + "enterAPriceOfZeroOrMoreForEveryCharge";
		expect(localizedInternalCatalogError(new Error(translate(key as never)), translate, prefix + "saveFailed", [key])).toBe(translate(key as never));
	});
	it("provides translated JSON and date validation", () => {
		expect(localizedInternalCatalogError(new SyntaxError("Unexpected token"), translate, prefix + "saveFailed")).toBe(`localized:${prefix}enterValidJson`);
		expect(localizedInternalCatalogError(new RangeError("Invalid time value"), translate, prefix + "saveFailed")).toBe(`localized:${prefix}enterValidDateTime`);
	});
	it("uses a translated fallback and retains diagnostics", () => {
		const error = new Error("Unknown English detail");
		expect(localizedInternalCatalogError(error, translate, prefix + "saveFailed")).toBe(`localized:${prefix}saveFailed`);
		expect(console.error).toHaveBeenCalledWith(error);
	});
});
