import { describe, expect, it } from "vitest";
import { composeMessage } from "../lib/mentions";
import { rewoundDraft } from "./rewind";

describe("rewoundDraft", () => {
	it("returns the text with its attachments as chips, which send as the same attachments", () => {
		const draft = rewoundDraft({ text: "Look at @src/app.ts", attachments: [{ id: "a1", taskId: "t", name: "shot.png", kind: "image", mimeType: "image/png", size: 1 }, { id: "a2", taskId: "t", name: "notes.txt", kind: "text", mimeType: "text/plain", size: 1 }] });
		expect(draft).toBe("Look at @src/app.ts\n@[shot.png](attachment:a1) @[notes.txt](attachment:a2)");
		expect(composeMessage(draft)).toMatchObject({ text: "Look at @src/app.ts", attachments: ["a1", "a2"] });
	});
	it("keeps plain messages as they were", () => {
		expect(rewoundDraft({ text: "Hello" })).toBe("Hello");
		expect(rewoundDraft({ text: "", attachments: [{ id: "a1", taskId: "t", name: "x.pdf", kind: "text", mimeType: "application/pdf", size: 1 }] })).toBe("@[x.pdf](attachment:a1)");
	});
});
