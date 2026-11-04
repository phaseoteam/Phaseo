import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countRetention, expiredEntries, removeRetention, scanRetention } from "./storageRetention";

const day = 86_400_000, now = Date.parse("2026-11-02T12:00:00Z");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("storage retention", () => {
	it("selects only the kind's own files older than the days set", () => {
		const entry = (name: string, age: number, isFile = true) => ({ name, isFile, modifiedAt: now - age * day, bytes: 10 });
		const recordings = [entry("browser-recording-abc.webm", 31), entry("browser-recording-def.mp4", 29), entry("notes.txt", 400), entry("browser-recording-ghi.webm", 40, false), entry("browser-recording-x.mov", 400)];
		expect(expiredEntries(recordings, "recordings", 30, now).map(value => value.name)).toEqual(["browser-recording-abc.webm"]);
		expect(expiredEntries(recordings, "recordings", null, now)).toEqual([]);
		// The log being written is never removed, however old; only rotated ones are.
		const logs = [entry("traces.ndjson", 90), entry("traces.ndjson.1", 15), entry("traces.ndjson.2", 5), entry("other.log", 90)];
		expect(expiredEntries(logs, "logs", 7, now).map(value => value.name)).toEqual(["traces.ndjson.1"]);
	});

	it("previews, then removes only what is still expired and leaves everything else", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-retention-")); roots.push(root);
		const directories = { recordings: path.join(root, "browser-recordings"), logs: path.join(root, "logs") };
		mkdirSync(directories.recordings); mkdirSync(directories.logs); mkdirSync(path.join(directories.recordings, "browser-recording-dir.webm"));
		const file = (directory: string, name: string, age: number, bytes = 100) => { const target = path.join(directory, name); writeFileSync(target, "x".repeat(bytes)); utimesSync(target, (now - age * day) / 1000, (now - age * day) / 1000); return target; };
		const old = file(directories.recordings, "browser-recording-old.webm", 60, 300), recent = file(directories.recordings, "browser-recording-new.mp4", 3);
		const stranger = file(directories.recordings, "keep-me.webm", 60), rotated = file(directories.logs, "traces.ndjson.1", 20, 50), current = file(directories.logs, "traces.ndjson", 20), touched = file(directories.logs, "traces.ndjson.2", 20);
		const rules = { recordings: 30, logs: 14 };
		const files = await scanRetention(directories, rules, now);
		expect(files.map(value => value.path).sort()).toEqual([old, rotated, touched].sort());
		expect(countRetention(files)).toEqual({ recordings: { files: 1, bytes: 300 }, logs: { files: 2, bytes: 150 } });
		// A file written to since the preview is no longer past its days, so it stays.
		utimesSync(touched, now / 1000, now / 1000);
		const report = await removeRetention(files, directories, rules, now);
		expect(report.removed).toEqual({ recordings: { files: 1, bytes: 300 }, logs: { files: 1, bytes: 50 } });
		expect(report.failed).toBe(0);
		expect([old, rotated].map(existsSync)).toEqual([false, false]);
		expect([recent, stranger, current, touched, path.join(directories.recordings, "browser-recording-dir.webm")].map(existsSync)).toEqual([true, true, true, true, true]);
		// A listed path outside its folder is refused, never removed.
		const outside = file(root, "browser-recording-outside.webm", 90);
		expect((await removeRetention([{ kind: "recordings", path: outside, modifiedAt: 0, bytes: 1 }], directories, rules, now)).failed).toBe(1);
		expect(existsSync(outside)).toBe(true);
		// Kept forever: nothing is listed.
		expect(await scanRetention(directories, { recordings: null, logs: null }, now)).toEqual([]);
	});
});
