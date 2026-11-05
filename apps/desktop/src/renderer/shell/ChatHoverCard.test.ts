import { expect, it } from "vitest";
import { replyPreview } from "./ChatHoverCard";

it("reduces the latest reply to one plain line of its words", () => {
	expect(replyPreview("## Done\n\nI fixed **the bug** in [the parser](src/parse.ts).\n\n```ts\nconst x = 1;\n```\nAll `tests` pass.")).toBe("Done I fixed the bug in the parser. All tests pass.");
	expect(replyPreview("x".repeat(400))).toHaveLength(220);
});
