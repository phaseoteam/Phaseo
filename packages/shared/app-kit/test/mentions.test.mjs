import assert from "node:assert/strict";
import { test } from "node:test";
import { mentionPlainText, mentionToken, parseMentions } from "../src/mentions.ts";

test("tokens round-trip, with the ref encoded", () => {
	const mention = { kind: "file", ref: "src/a (copy).ts", label: "a (copy).ts" };
	const token = mentionToken(mention);
	assert.equal(token, "@[a (copy).ts](file:src%2Fa%20%28copy%29.ts)");
	assert.deepEqual(parseMentions(`Read ${token} now`), ["Read ", mention, " now"]);
});

test("labels lose brackets and new lines", () => {
	assert.equal(mentionToken({ kind: "chat", ref: "t1", label: "[draft]\nplan" }), "@[ draft  plan](chat:t1)");
});

test("malformed tokens and unknown kinds stay as text", () => {
	assert.deepEqual(parseMentions("@[x](nope:1) and @[y](file:%E0)"), ["@[x](nope:1) and @[y](file:%E0)"]);
});

test("plain text reads chips as labels, chats with an @", () => {
	assert.equal(mentionPlainText("See @[Plan](chat:t1) and @[a.ts](file:a.ts)"), "See @Plan and a.ts");
});
