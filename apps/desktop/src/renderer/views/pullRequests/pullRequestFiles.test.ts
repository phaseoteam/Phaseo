import { describe, expect, it } from "vitest";
import { orderDiffFiles, patchLines } from "./pullRequestFileOrder";
import { countViewedFiles, isFileViewed, isStaleViewed, localViewedStates, readLocalViewed, revertFileViewedOverlay, settleFileViewedOverlay, toFileViewedStates } from "./pullRequestFilesViewed";

const file = (path: string, lines: string[] = []) => ({ path, lines });

describe("file order", () => {
	it("places source before tests and generated files across path conventions", () => {
		const source = ["src/app.ts", "src/dist.ts", "src/testing.ts"];
		const tests = ["src/__tests__/app.ts", "src/app.spec.tsx", "src/app.test.ts", "test/app.ts", "tests/helpers/app.ts"];
		const generated = ["apps/web/package-lock.json", "dist/app.js", "packages/core/vendor/lib.js", "pnpm-lock.yaml", "public/app.min.js", "src/__snapshots__/app.ts", "src/api.generated.ts", "src/app.test.ts.snap"];
		expect(orderDiffFiles([...generated, ...tests, ...source].reverse().map(path => file(path)))).toEqual([...source, ...tests, ...generated]);
	});
	it("puts a dependency before what imports it, the whole chain down, and survives a cycle", () => {
		expect(orderDiffFiles([file("src/a.ts", ['import { b } from "./b";']), file("src/b.ts", ['import { c } from "./c.js";']), file("src/c.ts")])).toEqual(["src/c.ts", "src/b.ts", "src/a.ts"]);
		expect(orderDiffFiles([file("src/a.ts", ['import "./b"']), file("src/b.ts", ['const a = require("./a")'])])).toEqual(["src/a.ts", "src/b.ts"]);
	});
	it("puts each test after the source it names", () => {
		expect(orderDiffFiles([file("src/z.test.ts"), file("src/a.test.ts"), file("src/z.ts"), file("src/a.ts", ['import "./z"'])])).toEqual(["src/z.ts", "src/a.ts", "src/z.test.ts", "src/a.test.ts"]);
	});
	it("reads only a patch's changed lines", () => { expect(patchLines("@@ -1 +1 @@\n-old\n+new\n context\n+++ b/x")).toEqual(["old", "new"]); });
});

describe("viewed files", () => {
	const states = toFileViewedStates({ files: [{ path: "a", state: "viewed" }, { path: "b", state: "dismissed" }, { path: "c", state: "unviewed" }], truncated: false });
	it("reads GitHub's states with presses over them, and counts against every path given", () => {
		const overlay = new Map([["c", true]]);
		expect(["a", "b", "c", "d"].map(path => isFileViewed(path, states, overlay))).toEqual([true, false, true, false]);
		expect(isStaleViewed("b", states, overlay)).toBe(true);
		expect(isStaleViewed("b", states, new Map([["b", true]]))).toBe(false);
		expect(countViewedFiles(["a", "b", "c"], states, overlay)).toBe(2);
		expect(countViewedFiles(["a"], null, new Map())).toBe(0);
	});
	it("holds a press until a read that could have seen it lands", () => {
		const overlay = new Map([["c", true], ["a", false]]);
		expect(settleFileViewedOverlay(overlay, states, new Set(["c", "a"]), new Set())).toBe(overlay);
		expect([...settleFileViewedOverlay(overlay, states, new Set(), new Set())]).toEqual([["c", true], ["a", false]]);
		expect([...settleFileViewedOverlay(overlay, states, new Set(), new Set(["a"]))]).toEqual([["c", true]]);
		expect([...settleFileViewedOverlay(new Map([["a", true]]), states, new Set(), new Set())]).toEqual([]);
	});
	it("takes back only the presses a failed request still owns", () => {
		const overlay = new Map([["a", false], ["c", true]]);
		expect([...revertFileViewedOverlay(overlay, [{ path: "a", viewed: false }, { path: "c", viewed: true }], new Set(["a"]))]).toEqual([["c", true]]);
		expect(revertFileViewedOverlay(overlay, [{ path: "c", viewed: false }], new Set(["c"]))).toBe(overlay);
	});
	it("keeps local ticks as GitHub would say them, with a push showing as dismissed", () => {
		const storage = { getItem: () => JSON.stringify({ a: "blob1", b: "old", bad: 3 }) };
		const local = readLocalViewed(storage, "key");
		expect(local).toEqual({ a: "blob1", b: "old" });
		expect([...localViewedStates(local, new Map([["a", "blob1"], ["b", "new"]]))]).toEqual([["a", "viewed"], ["b", "dismissed"]]);
		expect(readLocalViewed({ getItem: () => "{not json" }, "key")).toEqual({});
	});
});
