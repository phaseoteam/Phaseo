import { lstat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { retentionKinds, type RetentionCount, type RetentionKind, type RetentionReport } from "../shared/maintenance";

/** Only the app's own files: saved recordings, and trace logs already rotated out (the file being written stays). */
const patterns: Record<RetentionKind, RegExp> = { recordings: /^browser-recording-[a-z0-9]+\.(?:mp4|webm)$/, logs: /^traces\.ndjson\.\d+$/ };
const dayMs = 86_400_000;

export type RetentionEntry = { name: string; isFile: boolean; modifiedAt: number; bytes: number };
export type RetentionFile = { kind: RetentionKind; path: string; modifiedAt: number; bytes: number };
export type RetentionRules = Record<RetentionKind, number | null>;

/** The entries of one folder that a rule removes: the kind's own files, last changed more than `afterDays` ago. Never anything else. */
export function expiredEntries(entries: RetentionEntry[], kind: RetentionKind, afterDays: number | null, now = Date.now()) {
	if (afterDays === null) return [];
	const cutoff = now - afterDays * dayMs;
	return entries.filter(entry => entry.isFile && patterns[kind].test(entry.name) && entry.modifiedAt < cutoff);
}

async function entriesOf(directory: string): Promise<RetentionEntry[]> {
	const names = await readdir(directory).catch(() => [] as string[]);
	const entries = await Promise.all(names.map(async name => {
		// lstat, so a link is never followed out of the folder.
		const info = await lstat(path.join(directory, name)).catch(() => undefined);
		return info && { name, isFile: info.isFile(), modifiedAt: info.mtimeMs, bytes: info.size };
	}));
	return entries.filter((entry): entry is RetentionEntry => !!entry);
}

/** The files the rules would remove now, per kind. */
export async function scanRetention(directories: Record<RetentionKind, string>, rules: RetentionRules, now = Date.now()) {
	const files: RetentionFile[] = [];
	for (const kind of retentionKinds) for (const entry of expiredEntries(await entriesOf(directories[kind]), kind, rules[kind], now)) files.push({ kind, path: path.join(directories[kind], entry.name), modifiedAt: entry.modifiedAt, bytes: entry.bytes });
	return files;
}

export const countRetention = (files: RetentionFile[]) => Object.fromEntries(retentionKinds.map(kind => [kind, files.filter(file => file.kind === kind).reduce<RetentionCount>((sum, file) => ({ files: sum.files + 1, bytes: sum.bytes + file.bytes }), { files: 0, bytes: 0 })])) as Record<RetentionKind, RetentionCount>;

/** Removes files from a scan, each checked again first: still the kind's own file, directly in its folder and still past the rule's days. */
export async function removeRetention(files: RetentionFile[], directories: Record<RetentionKind, string>, rules: RetentionRules, now = Date.now()): Promise<RetentionReport> {
	const removed: RetentionFile[] = []; let failed = 0;
	for (const file of files) {
		if (path.dirname(file.path) !== directories[file.kind]) { failed++; continue; }
		const info = await lstat(file.path).catch(() => undefined);
		if (!info) continue;
		if (!expiredEntries([{ name: path.basename(file.path), isFile: info.isFile(), modifiedAt: info.mtimeMs, bytes: info.size }], file.kind, rules[file.kind], now).length) continue;
		try { await rm(file.path); removed.push({ ...file, bytes: info.size }); } catch { failed++; }
	}
	return { removed: countRetention(removed), failed, finishedAt: new Date(now).toISOString() };
}
