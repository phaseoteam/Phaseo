import { expect, it } from "vitest";
import { isLargePaste, largePasteBytes } from "./largePaste";

it("treats a paste of 32 KiB or more as large, counting bytes", () => {
	expect(isLargePaste("a".repeat(largePasteBytes - 1))).toBe(false);
	expect(isLargePaste("a".repeat(largePasteBytes))).toBe(true);
	// Three bytes a character: under the limit in characters, over it in bytes.
	expect(isLargePaste("語".repeat(Math.ceil(largePasteBytes / 3)))).toBe(true);
});
