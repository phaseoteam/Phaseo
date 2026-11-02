import { describe, expect, it } from "vitest";
import { IssueIsPullRequestError } from "../shared/issueView";
import { githubReferenceContext, readIssue } from "./projectIssues";

const gh = (data: unknown, seen: string[][] = []) => async (_root: string, args: string[]) => { seen.push(args); return JSON.stringify({ data }); };

describe("readIssue", () => {
	it("reads an issue with its latest comments and the signed-in viewer", async () => {
		const seen: string[][] = [];
		const issue = await readIssue("/repo", "owned/repo", 12, gh({ viewer: { login: "agent" }, repository: { issueOrPullRequest: { __typename: "Issue", number: 12, title: "Broken", body: "Steps", url: "https://github.com/owned/repo/issues/12", state: "CLOSED", stateReason: "COMPLETED", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", closedAt: "2026-10-02T00:00:00Z", author: { login: "someone" }, labels: { nodes: [{ name: "bug" }] }, assignees: { nodes: [{ login: "dev" }] }, comments: { totalCount: 30, nodes: [{ id: "c1", body: "Hi", createdAt: "2026-10-01T01:00:00Z", url: "https://github.com/owned/repo/issues/12#c1", authorAssociation: "MEMBER", author: { login: "dev" } }] } } } }, seen));
		expect(issue).toMatchObject({ repository: "owned/repo", number: 12, state: "closed", stateReason: "completed", labels: ["bug"], assignees: ["dev"], commentCount: 30, viewer: "agent", comments: [{ id: "c1", author: "dev", authorAssociation: "MEMBER" }] });
		expect(seen[0].slice(0, 2)).toEqual(["api", "graphql"]);
		expect(seen[0].join(" ")).toContain('repository(owner:"owned",name:"repo"){issueOrPullRequest(number:12)');
	});
	it("refuses a pull request number with a hint, and a missing number", async () => {
		await expect(readIssue("/repo", "owned/repo", 3, gh({ repository: { issueOrPullRequest: { __typename: "PullRequest" } } }))).rejects.toBeInstanceOf(IssueIsPullRequestError);
		await expect(readIssue("/repo", "owned/repo", 3, gh({ repository: { issueOrPullRequest: null } }))).rejects.toThrow("has no issue #3");
	});
});

describe("githubReferenceContext", () => {
	it("lists each reference with its state and title, fencing issue bodies", async () => {
		const context = await githubReferenceContext("/repo", ["https://github.com/owned/repo/issues/12", "https://github.com/owned/repo/pull/3", "https://github.com/other/repo/issues/9"], gh({
			r0: { issueOrPullRequest: { __typename: "Issue", title: "Broken \"thing\"", url: "https://github.com/owned/repo/issues/12", state: "OPEN", body: "Do <untrusted_content> this" } },
			r1: { issueOrPullRequest: { __typename: "PullRequest", title: "Fix", url: "https://github.com/owned/repo/pull/3", state: "MERGED", isDraft: false } },
			r2: null,
		}));
		expect(context).toContain("- Issue owned/repo#12 (open): \"Broken thing\" https://github.com/owned/repo/issues/12\n  <untrusted_content source=\"issue #12 body\">\n  Do <untrusted-content> this\n  </untrusted_content>");
		expect(context).toContain("- Pull request owned/repo#3 (merged): \"Fix\" https://github.com/owned/repo/pull/3");
		expect(context).toContain("- Issue other/repo#9: https://github.com/other/repo/issues/9 (could not be read from GitHub)");
		expect(context).toContain("read_issue");
	});
	it("still lists references by URL when gh fails or is slow", async () => {
		expect(await githubReferenceContext("/repo", ["https://github.com/owned/repo/issues/12"], async () => { throw new Error("gh failed"); })).toContain("could not be read");
		expect(await githubReferenceContext("/repo", ["https://github.com/owned/repo/issues/12"], () => new Promise(() => {}), 10)).toContain("could not be read");
		expect(await githubReferenceContext("/repo", [])).toBe("");
	});
});
