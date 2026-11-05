import { expect, it } from "vitest";
import { issueToTriage } from "./issueTriage";

it("reads an issue URL, or a number in the project's repository", () => {
	expect(issueToTriage(" https://github.com/acme/app/issues/42#issuecomment-1 ")).toBe("https://github.com/acme/app/issues/42");
	expect(issueToTriage("#42", "acme/app")).toBe("https://github.com/acme/app/issues/42");
	expect(issueToTriage("42", "acme/app")).toBe("https://github.com/acme/app/issues/42");
});

it("waits for text that names an issue", () => {
	for (const [text, repository] of [["42", undefined], ["#4", "not a repo"], ["https://github.com/acme/app/pull/42", "acme/app"], ["fix the login", "acme/app"], ["", "acme/app"]]) expect(issueToTriage(text!, repository)).toBeUndefined();
});
