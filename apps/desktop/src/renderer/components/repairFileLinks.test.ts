import { describe, expect, it } from "vitest";
import { repairFileLinks } from "./repairFileLinks";

describe("assistant local file destinations", () => {
	it.each(["E:/project/my file.ts:7:2", "/repo/src/main.ts#L7", "src/main.ts", "README.md", "file:///E:/project/main.ts"])("closes an unambiguous complete destination %s", filename => {
		const source = `Inspect [the handler](<${filename}) next.`;
		expect(repairFileLinks(source)).toBe(`Inspect [the handler](<${filename}>) next.`);
		expect(repairFileLinks(repairFileLinks(source))).toBe(repairFileLinks(source));
	});
	it("repairs several links without changing labels, emphasis or surrounding content", () => {
		expect(repairFileLinks("**Inspect** [one](<src/a.ts), then [two](<src/b.ts)."))
			.toBe("**Inspect** [one](<src/a.ts>), then [two](<src/b.ts>)." );
	});
	it.each([
		"`[literal](<src/a.ts)`", "```md\n[literal](<src/a.ts)\n```", "    [literal](<src/a.ts)",
		"\\[escaped](<src/a.ts)", "[escaped](<src/a.ts\\)", "![image](<src/a.ts)",
		"[existing](<src/a.ts>)", "[nested [literal](<src/a.ts)](https://example.invalid)",
		"[reference]: <src/a.ts)\n", "<span>[literal](<src/a.ts)</span>",
		"::code-comment{body=\"[literal](<src/a.ts)\"}", "::artifact-template{body=\"[literal](<src/a.ts)",
		"[web](<https://example.invalid/a.ts)", "[unsafe](<javascript:alert)", "[remote](<file://remote/a.ts)",
		"[partial](<src/a.ts", "[ambiguous](<src/a.ts)word", "[ambiguous](<src/a(ts).ts)",
		"[position](<src/a.ts:0)", "[word](<something)",
	])("leaves protected or incomplete Markdown unchanged: %s", source => {
		expect(repairFileLinks(source)).toBe(source);
	});
	it("keeps code literal while repairing the next paragraph and subsequent streamed content", () => {
		const partial = "`[code](<src/a.ts)`\n\n[handler](<src/b.ts";
		expect(repairFileLinks(partial)).toBe(partial);
		expect(repairFileLinks(partial + ")")).toBe(partial + ">)");
	});
});
