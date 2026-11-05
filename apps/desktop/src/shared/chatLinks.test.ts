import { describe, expect, it } from "vitest";
import { chatLink, parseChatLink } from "./chatLinks";

describe("chat links", () => {
	it("round-trips a chat id, including characters a URL would misread", () => {
		for (const id of ["3f2c9a1e-7b1d-4c55-9a64-0d3e2f1b8c77", "chat/with?odd#chars %"]) expect(parseChatLink(chatLink(id))).toBe(id);
	});
	it("reads the link a launcher hands over with a trailing slash or query, in any case", () => {
		expect(parseChatLink("phaseo://chat/abc/")).toBe("abc");
		expect(parseChatLink("PHASEO://chat/abc?from=browser")).toBe("abc");
	});
	it("ignores anything that is not a chat link", () => {
		for (const value of ["phaseo://chat/", "phaseo://settings/abc", "https://phaseo.app/chat/abc", "--allow-file-access", "phaseo://chat/%E0%A4%A"]) expect(parseChatLink(value)).toBeUndefined();
	});
});
