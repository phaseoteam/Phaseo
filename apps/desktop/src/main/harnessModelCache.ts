import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Harness, ModelOption } from "../shared/workspace";

/** A list younger than this is served without asking the harness again. */
export const HARNESS_MODELS_FRESH_MS = 60_000;
const MAX_ENTRIES = 200;
type Entry = { fetchedAt: number; harness: Harness; accountId: string; models: ModelOption[] };
type CacheFile = { version: 1; entries: Record<string, Entry> };

/**
 * The models each local harness last listed, kept on disk and served at once while the harness is asked again: Claude Code
 * and Codex take seconds to start, so asking them first left the model picker loading on every launch. A list for a
 * project nobody has asked about yet borrows the newest one from the same harness and account. A harness that fails to
 * answer loses its lists, so a removed CLI stops showing models and the next read reports the error.
 */
export class HarnessModelCache {
	private entries?: Promise<Map<string, Entry>>;
	private readonly refreshes = new Map<string, Promise<ModelOption[]>>();
	private writes: Promise<void> = Promise.resolve();
	constructor(private readonly file: string, private readonly onChange: (harness: Harness, accountId?: string) => void = () => {}, private readonly now: () => number = Date.now, private readonly warn: (message: string) => void = message => console.warn(message)) {}
	private load() {
		return this.entries ??= readFile(this.file, "utf8").then(text => {
			const file = JSON.parse(text) as CacheFile;
			if (file?.version !== 1 || typeof file.entries !== "object" || !file.entries) return new Map<string, Entry>();
			return new Map(Object.entries(file.entries).filter(([, entry]) => Number.isFinite(entry?.fetchedAt) && Array.isArray(entry.models) && entry.models.every(model => typeof model?.id === "string" && typeof model.name === "string")));
		}).catch(() => new Map<string, Entry>());
	}
	async get(harness: Harness, accountId: string | undefined, projectId: string | undefined, discover: () => Promise<ModelOption[]>): Promise<ModelOption[]> {
		const entries = await this.load(), key = cacheKey(harness, accountId, projectId), cached = entries.get(key);
		if (cached) {
			if (this.now() - cached.fetchedAt >= HARNESS_MODELS_FRESH_MS) this.background(harness, accountId, projectId, discover, cached.models);
			return cached.models;
		}
		const standIn = [...entries.values()].filter(entry => entry.harness === harness && entry.accountId === (accountId ?? "")).sort((a, b) => b.fetchedAt - a.fetchedAt)[0];
		if (!standIn) return this.refresh(harness, accountId, projectId, discover);
		this.background(harness, accountId, projectId, discover, standIn.models);
		return standIn.models;
	}
	/** Asks the harness now, once however many ask, and keeps the answer. */
	refresh(harness: Harness, accountId: string | undefined, projectId: string | undefined, discover: () => Promise<ModelOption[]>): Promise<ModelOption[]> {
		const key = cacheKey(harness, accountId, projectId), pending = this.refreshes.get(key);
		if (pending) return pending;
		const refresh = (async () => {
			const entries = await this.load();
			try {
				const models = await discover();
				entries.set(key, { fetchedAt: this.now(), harness, accountId: accountId ?? "", models });
				for (const [old] of [...entries].sort(([, a], [, b]) => a.fetchedAt - b.fetchedAt).slice(0, Math.max(0, entries.size - MAX_ENTRIES))) entries.delete(old);
				this.save(entries);
				return models;
			} catch (error) {
				// Every project's list goes, or one would stand in again and the next read would fail the same way.
				const stale = [...entries].filter(([, entry]) => entry.harness === harness && entry.accountId === (accountId ?? "")).map(([old]) => old);
				for (const old of stale) entries.delete(old);
				if (stale.length) this.save(entries);
				throw error;
			}
		})().finally(() => { if (this.refreshes.get(key) === refresh) this.refreshes.delete(key); });
		this.refreshes.set(key, refresh);
		return refresh;
	}
	/** Asks again unless already asking, and reports what came back to whoever is showing the list. */
	private background(harness: Harness, accountId: string | undefined, projectId: string | undefined, discover: () => Promise<ModelOption[]>, served: ModelOption[]) {
		if (this.refreshes.has(cacheKey(harness, accountId, projectId))) return;
		this.refresh(harness, accountId, projectId, discover).then(
			models => { if (JSON.stringify(models) !== JSON.stringify(served)) this.onChange(harness, accountId); },
			error => { this.warn(`Model discovery for ${harness} failed: ${error instanceof Error ? error.message : "unknown error"}`); this.onChange(harness, accountId); },
		);
	}
	/** Writes one at a time, each with the latest entries. */
	private save(entries: Map<string, Entry>) {
		this.writes = this.writes.then(async () => {
			const temporary = `${this.file}.${randomUUID()}.tmp`;
			try { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(temporary, JSON.stringify({ version: 1, entries: Object.fromEntries(entries) } satisfies CacheFile)); await rename(temporary, this.file); }
			catch (error) { await rm(temporary, { force: true }); this.warn(`Model list cache write failed: ${error instanceof Error ? error.message : "unknown error"}`); }
		});
		return this.writes;
	}
	/** Settles pending writes (tests). */
	flush() { return this.writes; }
}

function cacheKey(harness: Harness, accountId?: string, projectId?: string) { return `${harness}\0${accountId ?? ""}\0${projectId ?? ""}`; }
