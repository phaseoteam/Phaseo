import { describe, expect, it } from "vitest";
import type { PullRequestDirectoryEntry } from "../../../shared/pullRequestDirectory";
import { activeFilterCount, applyPullRequestOverrides, collectPullRequestFacets, filterPullRequestsByInvolvement, groupPullRequestsByInvolvement, matchesPullRequestFilters, matchesPullRequestQuery, menuFilters, narrowPullRequests, normalizePullRequestListPreferences, parsePullRequestQuery, pullRequestOverrideAfterAction, pullRequestQuickActions, rankPullRequestMatches, rankPullRequestsBlockedOnAuthor, rankPullRequestsByMergeReadiness, readPullRequestListPreferences, scorePullRequestMatch, settlePullRequestOverrides, sortPullRequestGroups, sweepKeys, writePullRequestListPreferences } from "./pullRequestDirectory.logic";

let next = 1;
const entry = (overrides: Partial<PullRequestDirectoryEntry> = {}): PullRequestDirectoryEntry => ({ projectId: "p1", repository: "team/app", number: next++, title: "Change", url: "https://github.com/team/app/pull/1", state: "open", draft: false, author: { login: "someone" }, head: "feature", base: "main", headOid: "a".repeat(40), createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", additions: 0, deletions: 0, labels: [], review: "none", checks: "none", mergeable: "MERGEABLE", viewerReviewRequested: false, ...overrides });
const numbers = (entries: readonly PullRequestDirectoryEntry[]) => entries.map(value => value.number);

describe("search syntax", () => {
	it("splits qualifiers from text, GitHub's way", () => {
		expect(parsePullRequestQuery("fix login label:bug -label:\"needs design\" author:@octo draft:true review:changes_requested status:failure")).toEqual({ text: "fix login", filters: { labels: [["bug"]], excludedLabels: ["needs design"], author: "octo", draft: "only", review: "changes-requested", checks: "failing" } });
	});
	it("reads comma lists as OR, and quoted names whole", () => {
		expect(parsePullRequestQuery("label:a,b label:\"x,y\"").filters.labels).toEqual([["a", "b"], ["x,y"]]);
	});
	it("treats unknown keys as namespaced labels, but not links or quoted text", () => {
		expect(parsePullRequestQuery("size:S,XS -area:web").filters).toEqual({ labels: [["size:S", "size:XS"]], excludedLabels: ["area:web"] });
		expect(parsePullRequestQuery("size:S,size:XS").filters.labels).toEqual([["size:S", "size:XS"]]);
		expect(parsePullRequestQuery("https://github.com/team/app/pull/1")).toEqual({ text: "https://github.com/team/app/pull/1", filters: {} });
		expect(parsePullRequestQuery("\"size:XXL\"")).toEqual({ text: "\"size:XXL\"", filters: {} });
	});
	it("keeps known keys with values they do not take as text", () => {
		expect(parsePullRequestQuery("status: draft:maybe review:lgtm -author:x")).toEqual({ text: "status: draft:maybe review:lgtm -author:x", filters: {} });
		expect(parsePullRequestQuery("checks:passing review:required draft:false").filters).toEqual({ checks: "passing", review: "review-required", draft: "hide" });
	});
	it("bounds what a hand-typed qualifier carries", () => {
		const parsed = parsePullRequestQuery(`label:${Array.from({ length: 12 }, (_, index) => `l${index}`).join(",")} label:${"x".repeat(250)}`);
		expect(parsed.filters.labels?.[0]).toHaveLength(10);
		expect(parsed.filters.labels?.[1][0]).toHaveLength(200);
	});
});

describe("filters", () => {
	it("matches rows by text, labels, author, draft and review", () => {
		const row = entry({ number: 42, title: "Welcome wizard", labels: [{ name: "Bug" }, { name: "size:S" }], author: { login: "Octo" }, draft: true, review: "required" });
		expect(matchesPullRequestQuery(row, "#42")).toBe(true);
		expect(matchesPullRequestQuery(row, "wizard")).toBe(true);
		expect(matchesPullRequestQuery(row, "nothing")).toBe(false);
		expect(matchesPullRequestFilters(row, { labels: [["bug", "other"], ["size:s"]], author: "octo", draft: "only", review: "review-required" })).toBe(true);
		expect(matchesPullRequestFilters(row, { excludedLabels: ["bug"] })).toBe(false);
		expect(matchesPullRequestFilters(row, { draft: "hide" })).toBe(false);
		expect(matchesPullRequestFilters(row, { author: "me" }, "octo")).toBe(true);
		expect(matchesPullRequestFilters(row, { author: "me" }, "someone-else")).toBe(false);
		expect(matchesPullRequestFilters(row, { review: "none" })).toBe(false);
	});
	it("narrows by state, project and involvement", () => {
		const mine = entry({ author: { login: "Me" } }), asked = entry({ viewerReviewRequested: true }), merged = entry({ state: "merged", projectId: "p2" });
		const rows = [mine, asked, merged];
		expect(numbers(narrowPullRequests(rows, { state: "open" }))).toEqual(numbers([mine, asked]));
		expect(numbers(narrowPullRequests(rows, { state: "all", projectId: "p2" }))).toEqual(numbers([merged]));
		expect(numbers(filterPullRequestsByInvolvement(rows, "me", "authored"))).toEqual(numbers([mine]));
		expect(numbers(filterPullRequestsByInvolvement(rows, "me", "reviewing"))).toEqual(numbers([asked]));
		expect(filterPullRequestsByInvolvement(rows, undefined, "authored")).toEqual([]);
	});
	it("collects authors by merges and labels by count, in the current state", () => {
		const facets = collectPullRequestFacets([entry({ author: { login: "a" }, state: "merged", labels: [{ name: "old" }] }), entry({ author: { login: "a" }, labels: [{ name: "Bug", color: "ff0000" }] }), entry({ author: { login: "b" }, labels: [{ name: "bug" }, { name: "x" }] }), entry({ author: { login: "c" }, state: "closed" })], "open");
		expect(facets.authors.map(author => [author.login, author.count, author.mergedCount])).toEqual([["a", 1, 1], ["b", 1, 0]]);
		expect(facets.labels).toEqual([{ name: "Bug", color: "ff0000", count: 2 }, { name: "x", count: 1 }]);
	});
});

describe("grouping and sorting", () => {
	it("groups authored first, then review requested, then others", () => {
		const both = entry({ author: { login: "me" }, viewerReviewRequested: true }), asked = entry({ viewerReviewRequested: true }), other = entry();
		const groups = groupPullRequestsByInvolvement([other, asked, both], "me");
		expect(groups.map(group => [group.label, numbers(group.entries)])).toEqual([["Authored", [both.number]], ["Review requested", [asked.number]], ["Others", [other.number]]]);
		expect(groupPullRequestsByInvolvement([other], "me").map(group => group.key)).toEqual(["others"]);
	});
	it("ranks search results by how well the row answers", () => {
		const exact = entry({ title: "welcome wizard" }), words = entry({ title: "wizard for the welcome" }), branch = entry({ title: "x", head: "welcome wizard" }), elsewhere = entry({ title: "unrelated" });
		expect(scorePullRequestMatch(exact, "welcome wizard")).toBe(90);
		expect(scorePullRequestMatch(elsewhere, "welcome wizard")).toBe(10);
		expect(scorePullRequestMatch(exact, `#${exact.number}`)).toBe(100);
		expect(numbers(rankPullRequestMatches([elsewhere, branch, words, exact], "welcome wizard"))).toEqual(numbers([exact, words, branch, elsewhere]));
	});
	it("orders by merge readiness: approved and green, green, other open, finished, conflicts", () => {
		const conflict = entry({ mergeable: "CONFLICTING", checks: "passing", review: "approved" }), done = entry({ state: "merged" }), draft = entry({ draft: true, checks: "passing" }), green = entry({ checks: "passing" }), ready = entry({ checks: "passing", review: "approved" }), bigReady = entry({ checks: "passing", review: "approved", additions: 500 }), smallReady = entry({ checks: "passing", review: "approved", additions: 5 });
		expect(numbers(rankPullRequestsByMergeReadiness([conflict, done, draft, green, ready, bigReady, smallReady]))).toEqual(numbers([smallReady, bigReady, ready, green, draft, done, conflict]));
	});
	it("orders by what blocks the author", () => {
		const conflict = entry({ mergeable: "CONFLICTING" }), changes = entry({ review: "changes-requested" }), failing = entry({ checks: "failed" }), draft = entry({ draft: true }), waiting = entry(), done = entry({ checks: "passing", review: "approved" }), closed = entry({ state: "closed" });
		expect(numbers(rankPullRequestsBlockedOnAuthor([closed, done, waiting, draft, failing, changes, conflict]))).toEqual(numbers([conflict, changes, failing, draft, waiting, done, closed]));
	});
	it("applies the chosen sort inside each group and keeps relevance while searching", () => {
		const old = entry({ createdAt: "2026-01-01T00:00:00Z", additions: 50 }), recent = entry({ createdAt: "2026-09-01T00:00:00Z", additions: 5 }), unmeasured = entry({ createdAt: "2026-05-01T00:00:00Z" });
		const groups = [{ key: "others" as const, label: "Others", entries: [old, recent, unmeasured] }];
		expect(numbers(sortPullRequestGroups(groups, "newest", "")[0].entries)).toEqual(numbers([recent, unmeasured, old]));
		expect(numbers(sortPullRequestGroups(groups, "oldest", "")[0].entries)).toEqual(numbers([old, unmeasured, recent]));
		expect(numbers(sortPullRequestGroups(groups, "largest", "")[0].entries)).toEqual(numbers([old, recent, unmeasured]));
		expect(numbers(sortPullRequestGroups(groups, "smallest", "")[0].entries)).toEqual(numbers([recent, old, unmeasured]));
		expect(numbers(sortPullRequestGroups(groups, "updated", "")[0].entries)).toEqual(numbers([old, recent, unmeasured]));
		expect(numbers(sortPullRequestGroups(groups, "ready", "query")[0].entries)).toEqual(numbers([old, recent, unmeasured]));
		expect(sortPullRequestGroups(groups, "blocked", "", "all")[0]).toBe(groups[0]);
	});
});

describe("quick actions", () => {
	it("offers what the state allows", () => {
		expect(pullRequestQuickActions({ state: "open", draft: false })).toEqual(["close", "merge"]);
		expect(pullRequestQuickActions({ state: "open", draft: true })).toEqual(["close", "ready"]);
		expect(pullRequestQuickActions({ state: "closed", draft: false })).toEqual(["reopen"]);
		expect(pullRequestQuickActions({ state: "merged", draft: false })).toEqual([]);
	});
	it("shows the answer at once and drops rows the state filter no longer holds", () => {
		const row = entry(), draft = entry({ draft: true }), now = new Date("2026-10-16T12:00:00Z");
		const overrides = new Map([[`team/app#${row.number}`, pullRequestOverrideAfterAction(row, "close", now)], [`team/app#${draft.number}`, pullRequestOverrideAfterAction(draft, "ready", now)]]);
		expect(applyPullRequestOverrides([row, draft], overrides, "open")).toEqual([{ ...draft, draft: false, updatedAt: now.toISOString() }]);
		expect(applyPullRequestOverrides([row], overrides, "all")[0]).toMatchObject({ state: "closed" });
	});
	it("keeps an override against a stale read for a minute only", () => {
		const row = entry(), at = Date.parse("2026-10-16T12:00:00Z");
		const overrides = new Map([[`team/app#${row.number}`, pullRequestOverrideAfterAction(row, "close", new Date(at))]]);
		expect(settlePullRequestOverrides(overrides, [row], at + 1000).size).toBe(1);
		expect(settlePullRequestOverrides(overrides, [row], at + 61_000).size).toBe(0);
		expect(settlePullRequestOverrides(overrides, [{ ...row, state: "closed" }], at + 1000).size).toBe(0);
		expect(settlePullRequestOverrides(overrides, [], at + 1000).size).toBe(0);
	});
	it("sweeps the run of closable rows between origin and target", () => {
		const keys = ["a", "b", "c", "d", "e"];
		expect(sweepKeys(keys, "b", "d", () => true)).toEqual(["b", "c", "d"]);
		expect(sweepKeys(keys, "d", "a", key => key !== "c")).toEqual(["a", "b", "d"]);
		expect(sweepKeys(keys, "b", "z", () => true)).toEqual([]);
	});
});

describe("remembered preferences", () => {
	const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
	it("round-trips list controls and drops anything malformed", () => {
		const store = storage();
		writePullRequestListPreferences({ involvement: "authored", state: "merged", projectId: "p1", q: "wizard", draft: "hide", review: "approved", checks: "failing", author: "octo", labels: ["bug", "Bug", "ui"], sort: "largest" }, store);
		expect(readPullRequestListPreferences(store)).toEqual({ involvement: "authored", state: "merged", projectId: "p1", q: "wizard", draft: "hide", review: "approved", checks: "failing", author: "octo", labels: ["Bug", "ui"], sort: "largest" });
		expect(normalizePullRequestListPreferences({ involvement: "x", state: "x", draft: "maybe", sort: "ready", labels: "bug", q: "x".repeat(300) })).toEqual({ involvement: "all", state: "open" });
		const broken = storage(); broken.setItem("phaseo.desktop.pullRequests.preferences", "{not json");
		expect(readPullRequestListPreferences(broken)).toEqual({ involvement: "all", state: "open" });
	});
	it("turns menu choices into filters and counts what is narrowing the list", () => {
		const preferences = { involvement: "reviewing" as const, state: "open" as const, labels: ["bug", "ui"], author: "octo", draft: "only" as const };
		expect(menuFilters(preferences)).toEqual({ draft: "only", author: "octo", labels: [["bug"], ["ui"]] });
		expect(activeFilterCount(preferences)).toBe(5);
		expect(activeFilterCount({ involvement: "all", state: "open" })).toBe(0);
	});
});
