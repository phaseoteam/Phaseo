import { describe, expect, it } from "vitest";
import { highlightCode } from "./codeHighlight";

describe("conversation syntax highlighting", () => {
	it("preserves exact source text and supplies both theme colours", async () => {
		const source = 'const greeting = "Hello, 世界";\n  console.log(greeting);\n';
		const tokens = await highlightCode(source, "ts");
		expect(tokens).not.toBeNull();
		expect(tokens!.map(line => line.map(token => token.content).join("")).join("\n")).toBe(source);
		expect(tokens!.flat().some(token => token.light && token.dark && token.light !== token.dark)).toBe(true);
	});
	it("keeps markup as code text", async () => {
		const source = '<script>alert("hello")</script>\n';
		const tokens = await highlightCode(source, "html");
		expect(tokens!.map(line => line.map(token => token.content).join("")).join("\n")).toBe(source);
	});
	it("falls back for unknown languages and expensive inputs", async () => {
		for (const [source, language] of [["hello", "constructor"], ["hello", "unknown"], ["x".repeat(50_001), "ts"], ["x".repeat(4001), "python"], ["\n".repeat(1000), "json"]]) {
			expect(await highlightCode(source, language)).toBeNull();
		}
	});
});
