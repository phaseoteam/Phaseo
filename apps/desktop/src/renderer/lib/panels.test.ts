import { describe, expect, it, vi } from "vitest";
import { parsePatchFiles } from "@pierre/diffs";
import { allCollapsed, changeTone, diffExcerpt, diffFileTree, diffLineStat, diffTurns, scopeLabel, sectionOf, toggleAll, toggleOne } from "./diffSurface";
import { debounceSaves, fileBreadcrumbs, parseDelimitedPreview, renderedModeOf } from "./filePreview";
import { addGroup, canSplit, emptyLayout, reconcile, removeTerminal, split } from "./terminalGroups";
import { addReviewComment, formatReviewComment, rangeLabel, REVIEW_COMMENT_ADDED_EVENT, REVIEW_COMMENT_REMOVED_EVENT, removeReviewComment, reviewComments, takeReviewComments, type ReviewComment } from "./reviewComments";

const patch = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,4 @@
 one
-two
+TWO
 three
 four
diff --git a/src/lib/new.ts b/src/lib/new.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/new.ts
@@ -0,0 +1,2 @@
+alpha
+beta
`;

describe("diff surface", () => {
	const files = parsePatchFiles(patch, undefined, true).flatMap(value => value.files);
	it("numbers turns across the chat and lists those with snapshots, newest first", () => {
		const tree = "a".repeat(40), other = "b".repeat(40);
		const turns = diffTurns([
			{ id: "1", role: "user", startedAt: "t1" }, { id: "r", role: "assistant" } as never,
			{ id: "2", role: "user", startedAt: "t2", completedAt: "t3", checkpoint: { before: tree, after: other } },
			{ id: "3", role: "user", startedAt: "t4", checkpoint: { before: other } },
			{ id: "4", role: "user", startedAt: "t5", checkpoint: { before: other, after: tree } },
		]);
		expect(turns.map(turn => [turn.messageId, turn.number])).toEqual([["4", 4], ["2", 2]]);
		expect(scopeLabel({ kind: "turn" }, turns)).toBe("Latest turn");
		expect(scopeLabel({ kind: "turn", messageId: "2" }, turns)).toBe("Turn 2");
		expect(scopeLabel({ kind: "branch" }, turns)).toBe("Changes");
		expect(sectionOf({ kind: "turn", messageId: "2" }, turns)).toEqual({ id: "turn:2", title: "Turn 2" });
	});
	it("counts lines, builds the file tree and colours chevrons by change type", () => {
		expect(diffLineStat(files)).toEqual({ additions: 3, deletions: 1 });
		const tree = diffFileTree(files);
		expect(tree.map(node => node.name)).toEqual(["src"]);
		expect(tree[0].children.map(node => node.name)).toEqual(["lib", "app.ts"]);
		expect(tree[0].children[0].children[0]).toMatchObject({ path: "src/lib/new.ts", file: { type: "new", additions: 2, deletions: 0 } });
		expect(changeTone("new")).toBe("text-success"); expect(changeTone("deleted")).toBe("text-destructive"); expect(changeTone("change")).toBe("text-warning");
	});
	it("collapses one or all files", () => {
		const keys = ["a", "b"];
		expect(allCollapsed(keys, toggleAll(keys, new Set()))).toBe(true);
		expect(toggleAll(keys, new Set(keys)).size).toBe(0);
		expect([...toggleOne(new Set(["a"]), "b")]).toEqual(["a", "b"]);
	});
	it("quotes the commented lines with change markers", () => {
		expect(diffExcerpt(files[0], { start: 1, end: 3, side: "additions" })).toBe(" one\n+TWO\n three");
		expect(diffExcerpt(files[0], { start: 2, end: 2, side: "deletions" })).toBe("-two");
	});
});

describe("file previews", () => {
	it("parses quoted CSV and caps rows and columns", () => {
		expect(parseDelimitedPreview("a,b\n\"x,1\",\"say \"\"hi\"\"\"\r\n", ",")).toEqual({ rows: [["a", "b"], ["x,1", "say \"hi\""]], truncated: false });
		const wide = parseDelimitedPreview("1\t2\t3\n4\t5\t6", "\t", 100, 2);
		expect(wide).toEqual({ rows: [["1", "2"], ["4", "5"]], truncated: true });
		const long = parseDelimitedPreview(Array.from({ length: 10 }, (_, index) => `row${index}`).join("\n"), ",", 3);
		expect(long.rows).toHaveLength(4); expect(long.truncated).toBe(true);
	});
	it("names preview modes and breadcrumbs", () => {
		expect(renderedModeOf("README.md")).toBe("markdown"); expect(renderedModeOf("a.tsv")).toBe("table"); expect(renderedModeOf("index.html")).toBe("html"); expect(renderedModeOf("a.ts")).toBeUndefined();
		expect(fileBreadcrumbs("Phaseo", "src/lib/a.ts").map(crumb => `${crumb.kind}:${crumb.path}`)).toEqual(["project:", "directory:src", "directory:src/lib", "file:src/lib/a.ts"]);
	});
	it("saves once after a quiet period and flushes on demand", async () => {
		vi.useFakeTimers();
		try {
			const saved: string[] = []; const saves = debounceSaves(async text => { saved.push(text); });
			saves.schedule("a"); saves.schedule("ab"); await vi.advanceTimersByTimeAsync(499); expect(saved).toEqual([]);
			await vi.advanceTimersByTimeAsync(1); expect(saved).toEqual(["ab"]);
			saves.schedule("abc"); await saves.flush(); expect(saved).toEqual(["ab", "abc"]); expect(saves.pending).toBe(false);
		} finally { vi.useRealTimers(); }
	});
});

describe("terminal groups", () => {
	it("splits up to four terminals and removes them with a sensible next focus", () => {
		let layout = addGroup(emptyLayout(), "a");
		layout = split(layout, "b", "vertical"); layout = split(layout, "c", "horizontal"); layout = split(layout, "d", "horizontal");
		expect(layout.groups).toEqual([{ id: "a", terminalIds: ["a", "b", "c", "d"], splitDirection: "vertical" }]);
		expect(canSplit(layout)).toBe(false); expect(split(layout, "e", "horizontal")).toBe(layout);
		layout = addGroup(layout, "e"); expect(layout.activeTerminalId).toBe("e"); expect(canSplit(layout)).toBe(true);
		layout = removeTerminal(layout, "e"); expect(layout.activeTerminalId).toBe("a"); expect(layout.groups).toHaveLength(1);
		layout = removeTerminal({ ...layout, activeTerminalId: "c" }, "c"); expect(layout.activeTerminalId).toBe("d");
		expect(reconcile(layout, ["a"], ["z"]).groups).toEqual([{ id: "a", terminalIds: ["a"], splitDirection: "vertical" }]);
		expect(reconcile(emptyLayout(), ["x"], ["x"])).toEqual({ groups: [{ id: "x", terminalIds: ["x"], splitDirection: "horizontal" }], activeTerminalId: "x" });
	});
});

describe("review comments", () => {
	it("stores comments per chat, announces them and formats them for the composer", () => {
		vi.stubGlobal("window", new EventTarget());
		const added = vi.fn(), removed = vi.fn();
		window.addEventListener(REVIEW_COMMENT_ADDED_EVENT, added); window.addEventListener(REVIEW_COMMENT_REMOVED_EVENT, removed);
		const comment: ReviewComment = { id: "c1", target: "chat", sectionId: "branch", sectionTitle: "Changes", filePath: "src/a.ts", side: "additions", start: 2, end: 3, rangeLabel: rangeLabel(3, 2), excerpt: "+a\n+b", fenceLanguage: "diff", text: "Rename this", createdAt: "now" };
		addReviewComment(comment);
		expect(reviewComments("chat")).toEqual([comment]); expect(reviewComments("other")).toEqual([]);
		expect(added).toHaveBeenCalledOnce();
		expect(formatReviewComment(comment)).toBe("Changes: src/a.ts (lines 2-3)\n```diff\n+a\n+b\n```\nRename this");
		removeReviewComment("chat", "c1"); expect(removed).toHaveBeenCalledOnce(); expect(reviewComments("chat")).toEqual([]);
		addReviewComment(comment); expect(takeReviewComments("chat")).toEqual([comment]); expect(reviewComments("chat")).toEqual([]);
	});
});

describe("commit diffs", () => {
	it("labels a commit by its short id and keeps its comments to that commit", () => {
		const selection = { kind: "commit" as const, sha: "0123456789abcdef0123456789abcdef01234567", subject: "Fix it" };
		expect(scopeLabel(selection, [])).toBe("Commit 0123456");
		expect(sectionOf(selection, [])).toEqual({ id: "commit:0123456789abcdef0123456789abcdef01234567", title: "Commit 0123456" });
	});
});
