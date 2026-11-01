import { describe, expect, it } from "vitest";
import { stashedDraft, stashKeyAction, stashSnippet } from "./promptStash";

describe("stashKeyAction", () => {
	it("parks a draft, restores a single stash and opens the list for several", () => {
		expect(stashKeyAction("Draft", 3)).toBe("stash");
		expect(stashKeyAction("  ", 0)).toBe("none");
		expect(stashKeyAction("", 1)).toBe("restore");
		expect(stashKeyAction("", 2)).toBe("open");
	});
});

describe("stashSnippet", () => {
	it("shows one line, cut short", () => {
		expect(stashSnippet("First\n\nsecond   line")).toBe("First second line");
		expect(stashSnippet("x".repeat(100), 10)).toBe(`${"x".repeat(10)}…`);
		expect(stashSnippet("  ")).toBe("(empty)");
	});
});

describe("stashedDraft", () => {
	it("keeps attachments in their own chat and leaves them out elsewhere", () => {
		const item = { id: "s", text: "Look @[shot.png](attachment:a1) here", taskId: "t1", createdAt: "" };
		expect(stashedDraft(item, "t1")).toEqual({ text: item.text, dropped: 0 });
		expect(stashedDraft(item, "t2")).toEqual({ text: "Look  here", dropped: 1 });
	});
});
