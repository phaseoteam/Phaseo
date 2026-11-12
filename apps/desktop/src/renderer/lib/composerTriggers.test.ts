import { describe, expect, it } from "vitest";
import { findTrigger, resolveSlash } from "./composerTriggers";

describe("findTrigger", () => {
	it("opens commands only for a slash at the start of the message", () => {
		expect(findTrigger("/rev", 4)).toEqual({ kind: "slash", query: "rev", start: 0, end: 4 });
		expect(findTrigger("/", 1)).toEqual({ kind: "slash", query: "", start: 0, end: 1 });
		expect(findTrigger("/review src", 11)).toBeUndefined();
		expect(findTrigger("see a/b", 7)).toBeUndefined();
	});
	it("opens mentions after a space or at the start, up to the caret", () => {
		expect(findTrigger("@", 1)).toEqual({ kind: "mention", query: "", start: 0, end: 1 });
		expect(findTrigger("look at @src/ma and", 15)).toEqual({ kind: "mention", query: "src/ma", start: 8, end: 15 });
		expect(findTrigger("mail me@example.com", 19)).toBeUndefined();
		expect(findTrigger("@done next", 10)).toBeUndefined();
	});
	it("opens pull requests for # after a space or at the start", () => {
		expect(findTrigger("#", 1)).toEqual({ kind: "pull-request", query: "", start: 0, end: 1 });
		expect(findTrigger("see #12", 7)).toEqual({ kind: "pull-request", query: "12", start: 4, end: 7 });
		expect(findTrigger("see #fix-ci", 11)).toEqual({ kind: "pull-request", query: "fix-ci", start: 4, end: 11 });
		expect(findTrigger("issue#12", 8)).toBeUndefined();
		expect(findTrigger("# Heading", 9)).toBeUndefined();
	});
});

describe("resolveSlash", () => {
	const commands = [{ name: "review", description: "", scope: "project" as const, hash: "h" }];
	const actions = [{ kind: "command" as const, id: "compact", name: "compact", description: "" }, { kind: "skill" as const, id: "global:pdf", name: "pdf", description: "" }];
	it("prefers saved prompts, then native commands and skills, keeping the arguments", () => {
		expect(resolveSlash("/review the parser ", commands, actions)).toEqual({ command: commands[0], arguments: "the parser" });
		expect(resolveSlash("/compact", commands, actions)).toEqual({ action: { kind: "command", id: "compact", name: "compact", arguments: "" }, arguments: "" });
		expect(resolveSlash("/skill:pdf report.pdf\nsecond line", commands, actions)?.action).toEqual({ kind: "skill", id: "global:pdf", name: "pdf", arguments: "report.pdf\nsecond line" });
	});
	it("leaves other text alone", () => {
		expect(resolveSlash("/unknown thing", commands, actions)).toBeUndefined();
		expect(resolveSlash("hello /review", commands, actions)).toBeUndefined();
	});
});
