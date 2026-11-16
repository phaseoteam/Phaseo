import { describe, expect, it } from "vitest";
import { feedFences, type FenceState } from "./markdownFences";

const feed = (chunks: string[]) => { const state: FenceState = { line: "" }; for (const chunk of chunks) feedFences(state, chunk); return state.fence; };

describe("feedFences", () => {
	it("follows fenced code blocks across chunks that split lines and fences", () => {
		expect(feed(["Intro\n``", "`ts\nconst a = 1;\n"])).toBe("```");
		expect(feed(["Intro\n```ts\nconst a = 1;\n``", "`\n"])).toBeUndefined();
		expect(feed(["~~~~\n```\n"])).toBe("~~~~");
		expect(feed(["````\n```\n"])).toBe("````");
		expect(feed(["Use ```inline``` code\n"])).toBeUndefined();
		expect(feed(["    ```\n"])).toBeUndefined();
	});
	it("returns where the open block closes when asked to stop there", () => {
		const state: FenceState = { line: "" };
		expect(feedFences(state, "```\ncode\n")).toBeUndefined();
		const text = "more\n```\nAfter";
		const closed = feedFences(state, text, true);
		expect(text.slice(0, closed)).toBe("more\n```\n");
		expect(state.fence).toBeUndefined();
	});
});
