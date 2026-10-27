import { expect, it } from "vitest";
import { quoteLines } from "./quote";

it("quotes a passage line by line, keeping paragraph breaks inside the quote", () => {
	expect(quoteLines("  First line  \r\nSecond\n\n\n\nNext paragraph\n")).toEqual(["> First line", "> Second", ">", "> Next paragraph"]);
	expect(quoteLines("One")).toEqual(["> One"]);
});
