import { describe, expect, it } from "vitest";
import { withoutHtmlComments } from "../../../shared/htmlText";
import { plainHtml } from "./Markdown";

describe("issue HTML as text", () => {
	it("turns images, breaks and summaries into Markdown, drops comments and known tags, and keeps other text", () => {
		expect(plainHtml("Line<br>next <img src=\"https://x/y.png\" alt=\"Shot\">")).toBe("Line  \nnext ![Shot](https://x/y.png)");
		expect(plainHtml("<details><summary>Logs</summary>trace</details>")).toBe("**Logs**\n\ntrace");
		expect(plainHtml("a <!-- bot state --> b <script>x</script> 1 < 2 <T>")).toBe("a  b x 1 < 2 <T>");
		expect(plainHtml("kept <!-- never closed")).toBe("kept <!-- never closed");
	});
	it("drops issue template comments for agents", () => {
		expect(withoutHtmlComments("<!-- Describe the bug -->Totals are wrong<!-- x -->.")).toBe("Totals are wrong.");
	});
});
