import { obfuscatedPlaceholder } from "./obfuscation";

describe("obfuscatedPlaceholder", () => {
	it("preserves formatting and length without using the original letters or digits", () => {
		expect(obfuscatedPlaceholder("person@example.com")).toMatch(/^.{6}@.{7}\..{3}$/);
		expect(obfuscatedPlaceholder("•••• •••• •••• 4242")).toMatch(/^•••• •••• •••• [a-z2-9]{4}$/);
		expect(obfuscatedPlaceholder("12/34")).toMatch(/^[a-z2-9]{2}\/[a-z2-9]{2}$/);
	});

	it("produces stable placeholders and handles empty values", () => {
		expect(obfuscatedPlaceholder("private")).toBe(obfuscatedPlaceholder("private"));
		expect(obfuscatedPlaceholder("")).toBe("");
	});
});
