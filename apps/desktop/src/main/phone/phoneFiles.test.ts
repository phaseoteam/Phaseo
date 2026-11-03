import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { phoneLimits, type DesktopFrame, type PhoneResponse } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { phoneFileList, phoneFilePreview } from "./phoneFiles";
import { PhoneHub } from "./phoneSession";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082", "hex");

describe("phone files", () => {
	const folders: string[] = [];
	afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
	const folder = () => { const value = mkdtempSync(path.join(tmpdir(), "phaseo-phone-files-")); folders.push(value); return value; };
	/** A project folder beside a folder outside it, with a link inside that points out. */
	const project = () => {
		const base = folder(), root = path.join(base, "project"), outside = path.join(base, "outside");
		mkdirSync(path.join(root, "src"), { recursive: true }); mkdirSync(outside);
		writeFileSync(path.join(root, "src", "usage.ts"), "export const usage = 1;\n");
		writeFileSync(path.join(root, "README.md"), "# Phaseo\n");
		writeFileSync(path.join(root, "logo.png"), png);
		writeFileSync(path.join(outside, "secret.txt"), "not yours\n");
		// A junction needs no special rights on Windows; elsewhere it's a plain directory link.
		symlinkSync(outside, path.join(root, "linked"), "junction");
		return { root, outside };
	};
	const connected = (capabilities: ("code" | "changes" | "terminal")[] = ["code"]) => {
		const app = fakePhoneHost(), hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
		let allowed = capabilities;
		hub.capabilitiesOf = () => allowed;
		const session = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame));
		const ask = async (request: object) => { await session.receive(JSON.stringify({ id: String(frames.length), ...request })); return frames.at(-1) as PhoneResponse; };
		return { app, ask, session, frames, allow: (next: typeof capabilities) => { allowed = next; hub.accessChanged("dev"); } };
	};

	it("sends nothing a file read found once Read code went off while it ran", async () => {
		const { root } = project();
		const { app, session, frames, allow } = connected();
		app.fileRoots.set("p1", root);
		const held: (() => void)[] = [], { files, readFile } = app.host;
		let allHeld!: () => void;
		const reading = new Promise<void>(resolve => { allHeld = resolve; });
		const hold = <T>(read: Promise<T>) => new Promise<T>(resolve => { if (held.push(() => resolve(read)) === 2) allHeld(); });
		app.host.files = (projectId, request) => hold(files(projectId, request));
		app.host.readFile = (projectId, filename) => hold(readFile(projectId, filename));
		const requests = [{ id: "list", type: "list_files", projectId: "p1", directory: "src" }, { id: "read", type: "read_file", projectId: "p1", path: "src/usage.ts" }];
		const pending = requests.map(request => session.receive(JSON.stringify(request)));
		await reading;
		allow([]);
		for (const release of held) release();
		await Promise.all(pending);
		for (const { id } of requests) expect(frames.find(frame => "id" in frame && frame.id === id)).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(JSON.stringify(frames)).not.toContain("usage");
	});

	it("refuses a path outside the project, whether by .., an absolute path or a link that points out", async () => {
		const { root, outside } = project();
		await expect(phoneFilePreview(root, "../outside/secret.txt")).rejects.toThrow("outside this project");
		await expect(phoneFilePreview(root, "src/../../outside/secret.txt")).rejects.toThrow("outside this project");
		await expect(phoneFilePreview(root, path.join(outside, "secret.txt"))).rejects.toThrow("outside this project");
		await expect(phoneFilePreview(root, "linked/secret.txt")).rejects.toThrow("outside the project");
		await expect(phoneFilePreview(root, "")).rejects.toThrow("Choose a file");
		await expect(phoneFilePreview(root, "src")).rejects.toThrow("not a file");
		expect(await phoneFilePreview(root, "src/usage.ts")).toEqual({ kind: "text", text: "export const usage = 1;\n", size: 24, truncated: false });
	});

	it("cuts text at a line past the phone's cap, and sends an image only up to it", async () => {
		const { root } = project();
		const line = `${"x".repeat(99)}\n`;
		writeFileSync(path.join(root, "big.txt"), line.repeat(8000));
		const big = await phoneFilePreview(root, "big.txt");
		if (big.kind !== "text") throw new Error("expected text");
		expect(big).toMatchObject({ size: 800_000, truncated: true });
		expect(Buffer.byteLength(big.text)).toBeLessThanOrEqual(phoneLimits.fileBytes);
		expect(big.text.endsWith(line)).toBe(true);
		// Text that escapes to six times its size in JSON is cut further, so the frame still fits.
		writeFileSync(path.join(root, "control.txt"), "\u0001".repeat(400_000));
		const control = await phoneFilePreview(root, "control.txt");
		expect(control).toMatchObject({ kind: "text", truncated: true });
		expect(Buffer.byteLength(JSON.stringify(control))).toBeLessThan(phoneLimits.frameBytes - 64 * 1024);

		expect(await phoneFilePreview(root, "logo.png")).toEqual({ kind: "image", mimeType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}`, size: png.length });
		writeFileSync(path.join(root, "photo.jpg"), Buffer.alloc(phoneLimits.fileBytes + 1));
		expect(await phoneFilePreview(root, "photo.jpg")).toEqual({ kind: "too-large", size: phoneLimits.fileBytes + 1 });
		writeFileSync(path.join(root, "data.bin"), Buffer.from([1, 0, 2]));
		expect(await phoneFilePreview(root, "data.bin")).toEqual({ kind: "unsupported", size: 3 });
		writeFileSync(path.join(root, "guide.pdf"), "%PDF-1.4");
		expect(await phoneFilePreview(root, "guide.pdf")).toEqual({ kind: "unsupported", size: 8 });
	});

	it("cuts a folder listing where the frame runs out of room", () => {
		const entries = Array.from({ length: 4000 }, (_, index) => ({ name: `${"n".repeat(300)}${index}`, path: `deep/${"n".repeat(300)}${index}`, directory: false }));
		const list = phoneFileList({ entries, truncated: false });
		expect(list.truncated).toBe(true);
		expect(list.entries.length).toBeLessThan(4000);
		expect(Buffer.byteLength(JSON.stringify(list))).toBeLessThan(phoneLimits.frameBytes - 64 * 1024);
		expect(phoneFileList({ entries: entries.slice(0, 2), truncated: false })).toEqual({ entries: entries.slice(0, 2), truncated: false });
	});

	it("lists, searches and reads a project's files by chat or project, only with the code capability", async () => {
		const { root } = project();
		const { ask, app } = connected();
		app.fileRoots.set("p1", root);
		app.addTask({ id: "usage-fix", title: "Fix usage", projectId: "p1" });
		const top = await ask({ type: "list_files", projectId: "p1", directory: "" });
		expect(top).toMatchObject({ ok: true, result: { truncated: false } });
		// The link out is a folder the walk doesn't follow into a file list; what's listed is the project's own.
		expect((top as { result: { entries: { path: string }[] } }).result.entries.map(entry => entry.path)).toEqual(expect.arrayContaining(["src", "README.md", "logo.png"]));
		expect(await ask({ type: "list_files", chatId: "usage-fix", directory: "src" })).toEqual(expect.objectContaining({ ok: true, result: { entries: [{ name: "usage.ts", path: "src/usage.ts", directory: false }], truncated: false } }));
		expect(await ask({ type: "list_files", chatId: "usage-fix", query: "usage" })).toMatchObject({ ok: true, result: { entries: [{ path: "src/usage.ts" }] } });
		expect(await ask({ type: "read_file", chatId: "usage-fix", path: "README.md" })).toMatchObject({ ok: true, result: { kind: "text", text: "# Phaseo\n" } });
		// The phone's frame refuses .. before the computer reads anything.
		const reads = app.fileReads.length;
		expect(await ask({ type: "read_file", projectId: "p1", path: "../outside/secret.txt" })).toMatchObject({ ok: false, error: { code: "invalid_frame" } });
		expect(await ask({ type: "list_files", projectId: "p1", directory: "src/.." })).toMatchObject({ ok: false, error: { code: "invalid_frame" } });
		expect(app.fileReads.length).toBe(reads);
		// A link out passes the frame's check and is refused by the computer's.
		expect(await ask({ type: "read_file", projectId: "p1", path: "linked/secret.txt" })).toMatchObject({ ok: false, error: { code: "rejected", message: "This path is outside the project." } });
		expect(await ask({ type: "read_file", projectId: "gone", path: "README.md" })).toMatchObject({ ok: false, error: { code: "not_found" } });

		const refused = connected([]);
		refused.app.fileRoots.set("p1", root);
		expect(await refused.ask({ type: "list_files", projectId: "p1", directory: "" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(await refused.ask({ type: "read_file", projectId: "p1", path: "README.md" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(refused.app.fileReads).toEqual([]);
	});
});
