import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelOption } from "../shared/workspace";

/** A cached catalog younger than this is served without a background refresh. */
export const MODEL_CATALOG_FRESH_MS = 60 * 60 * 1000;
export type ModelCatalogKey = { endpoint: string; accountId: string };
type CatalogFile = { version: 1; endpoint: string; accountId: string; fetchedAt: string; models: ModelOption[] };

/** Per-account model catalogs on disk, served stale-while-revalidate. */
export class ModelCatalogCache {
	private readonly refreshes = new Map<string, Promise<ModelOption[]>>();
	private readonly generations = new Map<string, number>();
	constructor(private readonly directory: string, private readonly onChange: (key: ModelCatalogKey) => void = () => {}, private readonly now: () => number = Date.now, private readonly warn: (message: string) => void = message => console.warn(message)) {}
	filename({ endpoint, accountId }: ModelCatalogKey) { return path.join(this.directory, `models-${createHash("sha256").update(`${endpoint}\0${accountId}`).digest("hex").slice(0, 32)}.json`); }
	async read(key: ModelCatalogKey): Promise<CatalogFile | undefined> {
		try {
			const file = JSON.parse(await readFile(this.filename(key), "utf8")) as CatalogFile;
			return file?.version === 1 && file.endpoint === key.endpoint && file.accountId === key.accountId && Number.isFinite(Date.parse(file.fetchedAt)) && Array.isArray(file.models) && file.models.every(model => typeof model?.id === "string" && typeof model.name === "string") ? file : undefined;
		} catch { return undefined; }
	}
	/** Returns the cached list at once, starting a background refresh when it is stale; only an empty cache waits for the network. */
	async get(key: ModelCatalogKey, fetchModels: () => Promise<ModelOption[]>): Promise<ModelOption[]> {
		const cached = await this.read(key);
		if (!cached) return this.refresh(key, fetchModels);
		if (this.now() - Date.parse(cached.fetchedAt) >= MODEL_CATALOG_FRESH_MS) this.refresh(key, fetchModels).catch(error => this.warn(`Model catalog refresh failed: ${error instanceof Error ? error.message : "unknown error"}`));
		return cached.models;
	}
	/** Fetches now with one shared request per account, then saves the list and reports it if it changed. */
	refresh(key: ModelCatalogKey, fetchModels: () => Promise<ModelOption[]>): Promise<ModelOption[]> {
		const file = this.filename(key), pending = this.refreshes.get(file);
		if (pending) return pending;
		const generation = this.generations.get(file) ?? 0;
		const refresh = (async () => {
			const models = await fetchModels();
			// A removal while fetching means the account is gone; do not resurrect its cache.
			if ((this.generations.get(file) ?? 0) !== generation) return models;
			const previous = await this.read(key);
			try { await this.write(file, { version: 1, ...key, fetchedAt: new Date(this.now()).toISOString(), models }); }
			catch (error) { this.warn(`Model catalog cache write failed: ${error instanceof Error ? error.message : "unknown error"}`); }
			if (previous && JSON.stringify(previous.models) !== JSON.stringify(models)) this.onChange(key);
			return models;
		})().finally(() => { if (this.refreshes.get(file) === refresh) this.refreshes.delete(file); });
		this.refreshes.set(file, refresh);
		return refresh;
	}
	async remove(key: ModelCatalogKey) {
		const file = this.filename(key);
		this.generations.set(file, (this.generations.get(file) ?? 0) + 1); this.refreshes.delete(file);
		await rm(file, { force: true });
	}
	private async write(file: string, contents: CatalogFile) {
		await mkdir(this.directory, { recursive: true });
		const temporary = `${file}.${randomUUID()}.tmp`;
		try { await writeFile(temporary, JSON.stringify(contents)); await rename(temporary, file); }
		catch (error) { await rm(temporary, { force: true }); throw error; }
	}
}
