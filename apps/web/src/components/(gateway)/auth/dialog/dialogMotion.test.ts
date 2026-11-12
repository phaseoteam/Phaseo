import { describe, expect, it } from "vitest";
import { anchorCorrection } from "./dialogMotion";

describe("anchorCorrection", () => {
	it("moves the dialog by the opposite of the anchor's drift", () => {
		// The options above the email field collapsed: the centred dialog moved the field up 78 px.
		expect(anchorCorrection(-78, 245, 575, 820)).toBe(78);
		// Clearing the field undoes it.
		expect(anchorCorrection(78, 167, 652, 820)).toBe(-78);
	});

	it("keeps the dialog 16 px inside the viewport", () => {
		// Only 20 px left below the dialog: stop at the margin.
		expect(anchorCorrection(-100, 300, 784, 820)).toBe(20);
		// Only 30 px left above it.
		expect(anchorCorrection(100, 46, 500, 820)).toBe(-30);
	});

	it("does nothing when the dialog is taller than the viewport (it scrolls instead)", () => {
		expect(anchorCorrection(-50, 10, 900, 820)).toBe(0);
	});
});
