import { describe, expect, it } from "vitest";
import { javascriptLiteral } from "../main/javascriptLiteral";
import { removeAll } from "./removeAll";

describe("removeAll", () => {
	it("removes matches a single pass would leave behind", () => {
		// One pass takes the inner comment and leaves "<!-- x -->".
		expect(removeAll("a<!<!---->-- x -->b", /<!--[\s\S]*?-->/g)).toBe("ab");
		expect(removeAll("<b>bold</b> <i>text</i>", /<[^>]*>/g)).toBe("bold text");
		expect(removeAll("plain", /<[^>]*>/g)).toBe("plain");
	});
});

describe("javascriptLiteral", () => {
	it("reads back as the same value, with nothing an HTML parser or old engine would trip on", () => {
		for (const value of ["</script><script>alert(1)</script>", "line\u2028separator\u2029", { selector: "a[href=\"x\"]" }, undefined]) {
			const source = javascriptLiteral(value);
			expect(source).not.toMatch(/[<>\u2028\u2029]/);
			expect(new Function(`return ${source};`)()).toEqual(value);
		}
	});
});
