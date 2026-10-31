import { expect, it } from "vitest";
import { changesSummary } from "./changedFiles";

const change = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

it("names the files a turn changed and totals the lines, leaving binary files out of the counts", () => {
	expect(changesSummary([change("src/app.ts", 3, 1)])).toEqual({ label: "Changed app.ts", files: 1, additions: 3, deletions: 1 });
	expect(changesSummary([change("a.ts"), change("b.ts"), change("logo.png", -1, -1)]).label).toBe("Changed a.ts, b.ts and logo.png");
	expect(changesSummary([change("a.ts"), change("b.ts"), change("c.ts"), change("d.ts", 2, 5)])).toEqual({ label: "Changed a.ts, b.ts and 2 more", files: 4, additions: 5, deletions: 5 });
});
