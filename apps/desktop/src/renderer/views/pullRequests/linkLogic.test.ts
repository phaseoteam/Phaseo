import { describe, expect, it } from "vitest";
import { linkValidation, parseCheckoutReference, resolveLinkInput } from "./linkLogic";

describe("the link dialog's input", () => {
	it("names the pull request a URL, owner/repo#N or bare number means", () => {
		expect(resolveLinkInput("https://github.com/other/repo/pull/7/files", "owned/repo")).toEqual({ link: { host: "github.com", repository: "other/repo", number: 7, url: "https://github.com/other/repo/pull/7" } });
		expect(resolveLinkInput("#42", "owned/repo")).toEqual({ link: { host: "github.com", repository: "owned/repo", number: 42, url: "https://github.com/owned/repo/pull/42" } });
		expect(resolveLinkInput("42", null)).toEqual({ error: "Paste a full URL to link a pull request from another repository." });
		expect(resolveLinkInput("not a pull request", "owned/repo")).toBeNull();
	});
	it("explains what to type", () => {
		expect(linkValidation("", null)).toBe("Paste a pull request URL or enter 123 / #123.");
		expect(linkValidation("abc", null)).toBe("Use a pull request URL, 123, or #123.");
		expect(linkValidation("#4", resolveLinkInput("#4", "owned/repo"))).toBeNull();
	});
});

describe("the checkout dialog's input", () => {
	it("reads a URL, a gh pr checkout command or a number, in this project's repository only", () => {
		expect(parseCheckoutReference("https://github.com/owned/repo/pull/7", "owned/repo")).toEqual({ number: 7 });
		expect(parseCheckoutReference("gh pr checkout 42", "owned/repo")).toEqual({ number: 42 });
		expect(parseCheckoutReference("gh pr checkout --force #9", "owned/repo")).toEqual({ number: 9 });
		expect(parseCheckoutReference("#3", undefined)).toEqual({ number: 3 });
		expect(parseCheckoutReference("https://github.com/other/repo/pull/7", "owned/repo")).toEqual({ error: "That pull request is in other/repo, not this project's repository." });
		expect(parseCheckoutReference("checkout please", "owned/repo")).toBeNull();
	});
});
