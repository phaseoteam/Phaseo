import { expect, it } from "vitest";
import { validAppFonts } from "./appFonts";

it("keeps font family lists and drops empty ones", () => {
	expect(validAppFonts({ interface: " Inter, sans-serif ", code: "" })).toEqual({ interface: "Inter, sans-serif" });
	expect(validAppFonts({})).toEqual({});
});

it("refuses anything that could end the CSS declaration", () => {
	for (const value of ["Inter; color: red", "x}", "<b>", "a".repeat(201)]) expect(() => validAppFonts({ code: value })).toThrow();
	expect(() => validAppFonts("Inter")).toThrow();
});
