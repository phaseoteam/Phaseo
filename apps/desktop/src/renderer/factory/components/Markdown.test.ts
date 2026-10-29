import { describe, expect, it } from "vitest";
import { plainHtml } from "./Markdown";

describe("plainHtml", () => {
	it("leaves no comment or tag behind when removing one joins the text around it into another", () => {
		expect(plainHtml("a<!<!-- x -->-- hidden -->b")).toBe("ab");
		expect(plainHtml("<scr<script>ipt>alert(1)</script>")).toBe("alert(1)");
		expect(plainHtml("Line<br>next <img src=\"https://x/y.png\" alt=\"Shot\">")).toBe("Line  \nnext ![Shot](https://x/y.png)");
	});
});
