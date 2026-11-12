import { expect, it } from "vitest";
import { changedFilesTree, changedFolders, changesSummary, type ChangedNode } from "./changedFiles";

const change = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

it("names the files a turn changed and totals the lines, leaving binary files out of the counts", () => {
	expect(changesSummary([change("src/app.ts", 3, 1)])).toEqual({ label: "Changed app.ts", files: 1, additions: 3, deletions: 1 });
	expect(changesSummary([change("a.ts"), change("b.ts"), change("logo.png", -1, -1)]).label).toBe("Changed a.ts, b.ts and logo.png");
	expect(changesSummary([change("a.ts"), change("b.ts"), change("c.ts"), change("d.ts", 2, 5)])).toEqual({ label: "Changed a.ts, b.ts and 2 more", files: 4, additions: 5, deletions: 5 });
});

it("arranges a turn's files as folders with their totals, joining single-folder chains", () => {
	const tree = changedFilesTree([change("src/lib/a.ts", 2, 1), change("src/lib/b.ts", 1, 0), change("src/main.ts", 4, 4), change("README.md", 1, 0), change("assets/logo.png", -1, -1)]);
	const shape = (nodes: ChangedNode[]): unknown => nodes.map(node => node.children ? { [`${node.name} +${node.additions} −${node.deletions}`]: shape(node.children) } : `${node.name}${node.binary ? " (binary)" : ` +${node.additions} −${node.deletions}`}`);
	expect(shape(tree)).toEqual([
		{ "assets +0 −0": ["logo.png (binary)"] },
		{ "src +7 −5": [{ "lib +3 −1": ["a.ts +2 −1", "b.ts +1 −0"] }, "main.ts +4 −4"] },
		"README.md +1 −0",
	]);
	expect(changedFolders(tree)).toEqual(["assets", "src", "src/lib"]);
	expect(changedFilesTree([change("deep/one/two/file.ts")]).map(node => [node.name, node.path])).toEqual([["deep/one/two", "deep/one/two"]]);
});
