import { describe, expect, it } from "vitest";
import { similarIssues, words } from "./similar";
import { emptyStages } from "./stages";
import type { WorkItem } from "./types";

function issue(number: number, title: string, body = "", patch: Partial<WorkItem> = {}): WorkItem {
	return {
		id: `acme/app#${number}`, source: "github", repo: "acme/app", number, kind: "issue", state: "open", title, body,
		author: { login: "maya" }, labels: [], url: "", createdAt: 0, updatedAt: 0, comments: 0, priority: "normal", stages: emptyStages(), ...patch,
	};
}

describe("similar issues", () => {
	const items = [
		issue(1, "Weekly token totals read 0 for decimal usage values", "The usage page shows 0 tokens this week when usage values are decimal strings."),
		issue(2, "Usage page weekly tokens show zero", "Since Monday the weekly tokens on the usage page are 0. The usage values look like decimal strings in the API."),
		issue(3, "Dark mode toggle forgets its setting", "After a reload the theme goes back to light."),
		issue(4, "Weekly token totals read 0", "Same thing in another repository", { repo: "acme/other", id: "acme/other#4" }),
		issue(5, "Price formatter drops trailing zeros", "", { kind: "pull" }),
	];

	it("finds the issue that describes the same problem, and only in the same repository", () => {
		const found = similarIssues(items[0]!, items);
		expect(found.map((entry) => entry.number)).toEqual([2]);
		expect(found[0]!.score).toBeGreaterThan(0.3);
	});

	it("finds nothing for an issue about something else", () => {
		expect(similarIssues(items[2]!, items)).toEqual([]);
	});

	it("ignores short and common words", () => {
		expect(words("The page is at https://x.dev and it's 0 for me")).toEqual(["page"]);
	});
});
