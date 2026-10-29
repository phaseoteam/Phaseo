import { describe, expect, it } from "vitest";
import { composeMessage, mentionPlainText, mentionToken, parseMentions } from "./mentions";

const chat = "3cc43115-02f3-406a-8101-604a3af05e44";

describe("mention tokens", () => {
	it("round-trips chips with awkward labels and refs", () => {
		const file = { kind: "file" as const, ref: "src/a (b)/c d.ts", label: "c [d].ts" };
		const text = `Look at ${mentionToken(file)} now`;
		expect(parseMentions(text)).toEqual(["Look at ", { ...file, label: "c  d .ts" }, " now"]);
		expect(parseMentions("@[x](unknown:y) and @[broken](file:%E0%A4%A)")).toEqual(["@[x](unknown:y) and @[broken](file:%E0%A4%A)"]);
	});
	it("sends files as @path, keeps chat tokens as references and lifts attachments out", () => {
		const draft = `Compare ${mentionToken({ kind: "file", ref: "src/usage.ts", label: "usage.ts" })} with ${mentionToken({ kind: "chat", ref: chat, label: "Fix usage" })} ${mentionToken({ kind: "attachment", ref: "a1", label: "shot.png" })}\n${mentionToken({ kind: "folder", ref: "docs", label: "docs" })}`;
		expect(composeMessage(draft)).toEqual({ text: `Compare @src/usage.ts with @[Fix usage](chat:${chat})\n@docs/`, threadReferences: [chat], attachments: ["a1"], images: [] });
		expect(mentionPlainText(draft)).toBe("Compare usage.ts with @Fix usage shot.png\ndocs");
	});
	it("sends a pull request chip as a link to it", () => {
		const pull = mentionToken({ kind: "pull-request", ref: "https://github.com/owned/repo/pull/12", label: "#12 Fix [the] build" });
		expect(parseMentions(pull)).toEqual([{ kind: "pull-request", ref: "https://github.com/owned/repo/pull/12", label: "#12 Fix  the  build" }]);
		expect(composeMessage(`Review ${pull}`).text).toBe("Review [#12 Fix  the  build](https://github.com/owned/repo/pull/12)");
		expect(mentionPlainText(pull)).toBe("#12 Fix  the  build");
	});
});
