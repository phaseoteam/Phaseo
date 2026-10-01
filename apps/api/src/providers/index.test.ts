import { describe, expect, it } from "vitest";
import { adapterFor, adapterById } from "./index";

describe("provider adapter registry", () => {
	it("resolves the venice adapter for text endpoints", () => {
		expect(adapterFor("venice", "responses")).toBeTruthy();
		expect(adapterFor("venice", "chat.completions")).toBeTruthy();
		expect(adapterById("venice")).toBeTruthy();
	});
	it("resolves Wafer ZDR without collapsing its routing identity", () => {
		expect(adapterFor("wafer-zdr", "chat.completions")).toBeTruthy();
		expect(adapterById("wafer-zdr")).toBeTruthy();
	});
});
