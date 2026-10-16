import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PullRequestView } from "../shared/pullRequestView";
import { sampleDiff } from "../shared/pullRequestGuideFixture";
import { PullRequestGuides } from "./pullRequestGuides";

const view = (headOid: string) => ({ number: 7, repository: "owner/repo", title: "Load with a limit", body: "", base: "main", head: "feature", headOid }) as PullRequestView;
const reply = JSON.stringify({ stops: [{ title: "Loading takes a limit", summary: "s", attention: null, excerpts: [{ path: "src/api.ts", side: "new", start: 2, end: 4, caption: "" }], files: [], notes: [], questions: [] }] });

describe("stored review guides", () => {
	it("writes a guide once per request, stores it per pull request and reports it stale after a push", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-guides-"));
		try {
			const complete = vi.fn(async () => ({ reply, model: "phaseo/fast" }));
			const guides = new PullRequestGuides(directory, complete, async () => sampleDiff), finished = vi.fn();
			guides.onFinished = finished;
			expect(await guides.get(view("a".repeat(40)))).toEqual({ guide: null, running: false, currentHeadSha: "a".repeat(40) });
			const written = await guides.generate("/repo", view("a".repeat(40)));
			expect(written.guide?.stops.map(stop => stop.title)).toEqual(["Loading takes a limit", "Other files"]);
			expect(written.guide).toMatchObject({ headSha: "a".repeat(40), model: "phaseo/fast" });
			expect(complete).toHaveBeenCalledTimes(1);
			await vi.waitFor(() => expect(finished).toHaveBeenCalledWith({ root: "/repo", view: expect.objectContaining({ number: 7 }) }));
			// Opening the tab again reads the stored guide without a model call, from a fresh service too.
			const again = new PullRequestGuides(directory, complete, async () => sampleDiff);
			const pushed = await again.get(view("b".repeat(40)));
			expect(pushed.guide?.headSha).toBe("a".repeat(40));
			expect(pushed.currentHeadSha).toBe("b".repeat(40));
			expect(complete).toHaveBeenCalledTimes(1);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("joins a run already going, and reports a failure for the head it was about", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-guides-"));
		try {
			let release!: () => void;
			const gate = new Promise<void>(resolve => { release = resolve; });
			const complete = vi.fn(async () => { await gate; return { reply: "not json", model: "m" }; });
			const guides = new PullRequestGuides(directory, complete, async () => sampleDiff);
			const first = guides.generate("/repo", view("c".repeat(40))), second = guides.generate("/repo", view("c".repeat(40)));
			await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
			expect((await guides.get(view("c".repeat(40)))).running).toBe(true);
			release();
			const [one, two] = await Promise.all([first, second]);
			expect(complete).toHaveBeenCalledTimes(1);
			expect(one.error).toContain("could not be read");
			expect(two.error).toBe(one.error);
			expect((await guides.get(view("d".repeat(40)))).error).toBeUndefined();
			const empty = new PullRequestGuides(directory, complete, async () => "");
			expect((await empty.generate("/repo", view("e".repeat(40)))).error).toContain("no changed files");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
