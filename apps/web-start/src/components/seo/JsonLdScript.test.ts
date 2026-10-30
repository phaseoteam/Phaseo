import { serializeJsonLd } from "./JsonLdScript";

describe("serializeJsonLd", () => {
	it("escapes script-breaking characters for inline JSON-LD", () => {
		const output = serializeJsonLd({
			name: '</script><script>alert(1)</script>',
			amp: "&",
		});

		expect(output).toContain("\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
		expect(output).toContain("\\u0026");
		expect(output).not.toContain("</script>");
	});
});
