import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { phoneLimits, type DesktopFrame, type PhoneResponse } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { PhonePairing, PhoneSettingsFile } from "./phoneDevices";
import { splitPatch } from "./phoneReview";
import { PhoneHub } from "./phoneSession";

const before = "a".repeat(40), after = "b".repeat(40), older = "c".repeat(40);
const patch = [
	"diff --git a/src/usage.ts b/src/usage.ts", "index 1111111..2222222 100644", "--- a/src/usage.ts", "+++ b/src/usage.ts",
	"@@ -1,3 +1,4 @@", " export function usage() {", "-  return 1;", "+  const total = 2;", "+  return total;", " }",
	"diff --git a/src/usage.test.ts b/src/usage.test.ts", "new file mode 100644", "index 0000000..3333333", "--- /dev/null", "+++ b/src/usage.test.ts",
	"@@ -0,0 +1,2 @@", "+import { usage } from \"./usage\";", "+// --- not a header inside a hunk",
	"diff --git a/old name.md b/old name.md", "deleted file mode 100644", "index 4444444..0000000", "--- a/old name.md", "+++ /dev/null", "@@ -1 +0,0 @@", "-gone",
	"diff --git a/a.txt b/b.txt", "similarity index 90%", "rename from a.txt", "rename to b.txt",
	"diff --git a/logo.png b/logo.png", "index 5555555..6666666 100644", "Binary files a/logo.png and b/logo.png differ",
	"diff --git \"a/caf\\303\\251.txt\" \"b/caf\\303\\251.txt\"", "index 7777777..8888888 100644", "--- \"a/caf\\303\\251.txt\"", "+++ \"b/caf\\303\\251.txt\"", "@@ -1 +1 @@", "-a", "+b", "",
].join("\n");

describe("phone review", () => {
	const folders: string[] = [];
	afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
	const connected = (capabilities: ("code" | "changes" | "terminal")[] = ["code"]) => {
		const app = fakePhoneHost(), hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
		let allowed = capabilities;
		hub.capabilitiesOf = () => allowed;
		const session = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame));
		const ask = async (request: object) => { await session.receive(JSON.stringify({ id: String(frames.length), ...request })); return frames.at(-1) as PhoneResponse; };
		return { app, hub, session, frames, ask, allow: (next: typeof capabilities) => { allowed = next; hub.accessChanged("dev"); } };
	};

	it("splits a diff into its files, with lines counted, renames, binaries and quoted paths", () => {
		expect(splitPatch(patch).map(({ patch: text, ...file }) => ({ ...file, patch: Boolean(text) }))).toEqual([
			{ path: "src/usage.ts", status: "modified", additions: 2, deletions: 1, patch: true },
			{ path: "src/usage.test.ts", status: "added", additions: 2, deletions: 0, patch: true },
			{ path: "old name.md", status: "deleted", additions: 0, deletions: 1, patch: true },
			{ path: "b.txt", oldPath: "a.txt", status: "renamed", additions: 0, deletions: 0, patch: true },
			{ path: "logo.png", status: "modified", additions: -1, deletions: -1, binary: true, patch: false },
			{ path: "café.txt", status: "modified", additions: 1, deletions: 1, patch: true },
		]);
		expect(splitPatch(patch)[0]!.patch).toBe(`${patch.split("\ndiff --git a/src/usage.test.ts")[0]}\n`);
	});

	it("refuses git and diffs without the code capability, and lists the capability in hello from protocol 4", async () => {
		const { ask, app } = connected([]);
		app.gitStatuses.set("p1", { files: [], branch: "main", hasRemote: false });
		expect(await ask({ type: "git_status", projectId: "p1" })).toMatchObject({ ok: false, error: { code: "forbidden", message: "Allow this on the computer: Settings → Phone." } });
		expect(await ask({ type: "read_diff", scope: "uncommitted", projectId: "p1" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(app.diffReads).toEqual([]);
		const allowed = connected(["code"]);
		expect(await allowed.ask({ type: "hello", deviceId: "dev", appVersion: "1", protocol: 4 })).toMatchObject({ ok: true, result: { protocol: 4, capabilities: ["code"] } });
		// A phone from 3 knows no frame that needs one, so it's told none, as before.
		expect(await allowed.ask({ type: "hello", deviceId: "dev", appVersion: "1", protocol: 3 })).toMatchObject({ ok: true, result: { protocol: 3, capabilities: [] } });
	});

	it("applies a switch at once: the phone hears the new list and its next request is refused", async () => {
		const { ask, allow, frames, app } = connected(["code"]);
		app.gitStatuses.set("p1", { files: [{ path: "src/usage.ts", indexStatus: " ", worktreeStatus: "M" }, { path: "new.ts", indexStatus: "?", worktreeStatus: "?" }, { path: "b.ts", oldPath: "a.ts", indexStatus: "R", worktreeStatus: " " }], branch: "usage-fix", upstream: { name: "origin/usage-fix", ahead: 1, behind: 0 }, hasRemote: true });
		await ask({ type: "hello", deviceId: "dev", appVersion: "1", protocol: 4 });
		expect(await ask({ type: "git_status", projectId: "p1" })).toMatchObject({ ok: true, result: { repository: true, branch: "usage-fix", upstream: { ahead: 1 }, hasRemote: true, files: [
			{ path: "src/usage.ts", status: "modified", staged: false }, { path: "new.ts", status: "untracked", staged: false }, { path: "b.ts", oldPath: "a.ts", status: "renamed", staged: true },
		] } });
		allow([]);
		expect(frames.at(-1)).toEqual({ type: "access", capabilities: [] });
		expect(await ask({ type: "git_status", projectId: "p1" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
	});

	it("sends nothing a read found once the switch went off while it ran", async () => {
		const { session, allow, frames, app } = connected(["code"]);
		app.gitStatuses.set("p1", { files: [{ path: "src/usage.ts", indexStatus: " ", worktreeStatus: "M" }], branch: "main", hasRemote: false });
		app.patches.set("uncommitted", patch);
		const { hash } = await app.host.diff("p1", { scope: "uncommitted" });
		const held: (() => void)[] = [], { gitStatus, diff } = app.host;
		let allHeld!: () => void;
		const reading = new Promise<void>(resolve => { allHeld = resolve; });
		const hold = <T>(read: Promise<T>) => new Promise<T>(resolve => { if (held.push(() => resolve(read)) === 3) allHeld(); });
		app.host.gitStatus = projectId => hold(gitStatus(projectId));
		app.host.diff = (projectId, request) => hold(diff(projectId, request));
		const requests = [
			{ id: "status", type: "git_status", projectId: "p1" },
			{ id: "diff", type: "read_diff", scope: "uncommitted", projectId: "p1" },
			{ id: "file", type: "read_diff_file", scope: "uncommitted", projectId: "p1", path: "src/usage.ts", hash },
		];
		const pending = requests.map(request => session.receive(JSON.stringify(request)));
		await reading;
		allow([]);
		for (const release of held) release();
		await Promise.all(pending);
		for (const { id } of requests) expect(frames.find(frame => "id" in frame && frame.id === id)).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(JSON.stringify(frames)).not.toContain("usage()");
	});

	it("sends no access event to a phone from before protocol 4", async () => {
		const { ask, allow, frames } = connected(["code"]);
		await ask({ type: "hello", deviceId: "dev", appVersion: "1", protocol: 3 });
		const count = frames.length;
		allow([]);
		expect(frames.length).toBe(count);
	});

	it("says a folder that isn't a checkout has nothing to review", async () => {
		const { ask } = connected();
		expect(await ask({ type: "git_status", projectId: "p1" })).toMatchObject({ ok: true, result: { repository: false, files: [] } });
		expect(await ask({ type: "git_status", projectId: "gone" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});

	it("reads a turn's snapshots from the chat's own message, the latest turn unless one is named", async () => {
		const { ask, app } = connected();
		app.addTask({ id: "usage-fix", title: "Fix usage", projectId: "p1", messages: [
			{ id: "u1", role: "user", text: "First", createdAt: "2026-11-01T09:00:00.000Z", checkpoint: { before: older, after: before } },
			{ id: "u2", role: "user", text: "Second", createdAt: "2026-11-01T09:10:00.000Z", checkpoint: { before, after } },
			{ id: "u3", role: "user", text: "Running", createdAt: "2026-11-01T09:20:00.000Z", checkpoint: { before: after } },
		] });
		app.patches.set(`turn:${before}:${after}`, patch);
		const latest = await ask({ type: "read_diff", scope: "turn", chatId: "usage-fix" });
		expect(latest).toMatchObject({ ok: true, result: { files: expect.arrayContaining([expect.objectContaining({ path: "src/usage.ts", additions: 2 })]) } });
		await ask({ type: "read_diff", scope: "turn", chatId: "usage-fix", messageId: "u1" });
		expect(app.diffReads.map(read => read.request)).toEqual([{ scope: "turn", from: before, to: after }, { scope: "turn", from: older, to: before }]);
		expect(await ask({ type: "read_diff", scope: "turn", chatId: "usage-fix", messageId: "u3" })).toMatchObject({ ok: false, error: { code: "not_found", message: "That turn has no saved snapshots to compare." } });
		// Tree ids from the phone are refused before anything reads them.
		expect(await ask({ type: "read_diff", scope: "turn", chatId: "usage-fix", from: before, to: after, messageId: "u1", projectId: "p1" })).toMatchObject({ ok: false, error: { code: "invalid_frame" } });
	});

	it("reviews a worktree thread in the worktree's own folder", async () => {
		const { ask, app } = connected();
		app.projects.push({ id: "wt", name: "Phaseo usage-fix", directory: "/work/phaseo-usage-fix", createdAt: "2026-11-01T00:00:00.000Z", worktree: { sourceProjectId: "p1", branch: "usage-fix" } } as never);
		app.addTask({ id: "in-worktree", projectId: "wt" });
		await ask({ type: "read_diff", scope: "uncommitted", chatId: "in-worktree" });
		await ask({ type: "read_diff", scope: "branch", projectId: "p1", baseRef: "origin/main" });
		expect(app.diffReads).toEqual([{ projectId: "wt", request: { scope: "uncommitted" } }, { projectId: "p1", request: { scope: "branch", baseRef: "origin/main" } }]);
	});

	it("keeps a 3 MB diff under the frame limit: every file listed, patches while they fit, the rest read one at a time", async () => {
		const { ask, app } = connected();
		const line = `+${"x".repeat(99)}`, file = (name: string, lines: number) => [`diff --git a/${name} b/${name}`, "--- /dev/null", `+++ b/${name}`, `@@ -0,0 +1,${lines} @@`, ...Array.from({ length: lines }, () => line)].join("\n");
		// Thirty files of 100 KB and one of 700 KB (past one file's cap).
		const big = [...Array.from({ length: 30 }, (_, index) => file(`part-${index}.txt`, 1000)), file("huge.txt", 7000)].join("\n") + "\n";
		expect(big.length).toBeGreaterThan(3_600_000);
		app.patches.set("uncommitted", big);
		const response = await ask({ type: "read_diff", scope: "uncommitted", projectId: "p1" });
		expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(phoneLimits.frameBytes - 32 * 1024);
		if (!response.ok || response.type !== "read_diff") throw new Error("expected a diff");
		const { files, hash, truncated } = response.result as Extract<PhoneResponse<"read_diff">, { ok: true }>["result"];
		expect(truncated).toBe(false);
		expect(files).toHaveLength(31);
		expect(files.every(entry => entry.additions > 0)).toBe(true);
		const withPatch = files.filter(entry => entry.patch).length;
		expect(withPatch).toBeGreaterThan(5);
		expect(withPatch).toBeLessThan(31);
		expect(files.find(entry => entry.path === "huge.txt")!.patch).toBeUndefined();

		const huge = await ask({ type: "read_diff_file", scope: "uncommitted", projectId: "p1", path: "huge.txt", hash });
		expect(huge).toMatchObject({ ok: true, result: { file: { path: "huge.txt", additions: 7000, truncated: true } } });
		const text = (huge as { result: { file: { patch: string } } }).result.file.patch;
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(phoneLimits.diffFileBytes);
		expect(text.endsWith(`${line}\n`)).toBe(true);
		const last = files.at(-2)!;
		expect(await ask({ type: "read_diff_file", scope: "uncommitted", projectId: "p1", path: last.path, hash })).toMatchObject({ ok: true, result: { file: { path: last.path, patch: expect.stringContaining(`+++ b/${last.path}`) } } });
		expect((await ask({ type: "read_diff_file", scope: "uncommitted", projectId: "p1", path: last.path, hash })).ok).toBe(true);

		// The work moved on: the old hash is refused rather than mixing two versions.
		app.patches.set("uncommitted", file("part-0.txt", 3));
		expect(await ask({ type: "read_diff_file", scope: "uncommitted", projectId: "p1", path: "huge.txt", hash })).toMatchObject({ ok: false, error: { code: "rejected" } });
	});

	it("keeps each phone's switches on disk, reading code by default for phones paired before them", () => {
		const folder = mkdtempSync(path.join(tmpdir(), "phaseo-phone-")); folders.push(folder);
		writeFileSync(path.join(folder, "phone.json"), JSON.stringify({ enabled: true, desktopId: "desk", devices: [{ id: "old", name: "Pixel", publicKey: "key", relayTokenHash: "hash", pairedAt: "2026-11-01T00:00:00.000Z" }] }));
		const store = new PhoneSettingsFile(folder), pairing = new PhonePairing(store), changed: string[] = [];
		expect(store.value.devices[0]!.access).toEqual({ code: true, changes: false, terminal: false });
		pairing.onAccessChanged = id => changed.push(id);
		pairing.setAccess("old", { code: false, terminal: true });
		expect(new PhoneSettingsFile(folder).value.devices[0]!.access).toEqual({ code: false, changes: false, terminal: true });
		expect(changed).toEqual(["old"]);
		expect(() => pairing.setAccess("gone", { code: true })).toThrow("no longer paired");
	});
});
