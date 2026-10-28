import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelOption } from "../shared/workspace";
import type { ApiModelCatalog, CatalogPageValidator } from "./apiModelCatalog";
import { span } from "./diagnostics/tracer";

/** A cached catalog younger than this is served without a background re-check. Re-checks send the saved ETags, so an unchanged catalog costs a bodiless 304 per page. */
export const MODEL_CATALOG_FRESH_MS = 15 * 60 * 1000;
export type ModelCatalogKey = { endpoint: string; accountId: string };
/** Version 3 added model facts and 4 their cache prices; older files are still served but count as stale and re-download in full, since their ETags would answer that nothing changed. */
export const CATALOG_VERSION = 4;
type CatalogFile = { version: 1 | 2 | 3 | 4; endpoint: string; accountId: string; fetchedAt: string; models: ModelOption[]; validators?: CatalogPageValidator[] };
/** Fetches the catalog; given the saved page validators it may answer that nothing changed. */
export type CatalogFetch = (validators?: CatalogPageValidator[]) => Promise<ModelOption[] | ApiModelCatalog>;

/** Per-account model catalogs on disk, served stale-while-revalidate. */
export class ModelCatalogCache {
	private readonly refreshes = new Map<string, Promise<ModelOption[]>>();
	private readonly generations = new Map<string, number>();
	constructor(private readonly directory: string, private readonly onChange: (key: ModelCatalogKey) => void = () => {}, private readonly now: () => number = Date.now, private readonly warn: (message: string) => void = message => console.warn(message)) {}
	filename({ endpoint, accountId }: ModelCatalogKey) { return path.join(this.directory, `models-${createHash("sha256").update(`${endpoint}\0${accountId}`).digest("hex").slice(0, 32)}.json`); }
	async read(key: ModelCatalogKey): Promise<CatalogFile | undefined> {
		try {
			const file = JSON.parse(await readFile(this.filename(key), "utf8")) as CatalogFile;
			return typeof file?.version === "number" && [1, 2, 3, CATALOG_VERSION].includes(file.version) && file.endpoint === key.endpoint && file.accountId === key.accountId && Number.isFinite(Date.parse(file.fetchedAt)) && Array.isArray(file.models) && file.models.every(model => typeof model?.id === "string" && typeof model.name === "string") ? file : undefined;
		} catch { return undefined; }
	}
	/**
	 * Another account's current catalog from the same gateway. Signing in again makes a new account, and the catalog barely
	 * differs between accounts, so it stands in while the account's own one downloads (10 s or more while the app starts).
	 */
	private async sameEndpoint(key: ModelCatalogKey): Promise<CatalogFile | undefined> {
		const own = path.basename(this.filename(key));
		const names = (await readdir(this.directory).catch(() => [] as string[])).filter(name => name !== own && /^models-[0-9a-f]{32}\.json$/.test(name));
		const files = await Promise.all(names.map(async name => {
			try { return JSON.parse(await readFile(path.join(this.directory, name), "utf8")) as CatalogFile; } catch { return undefined; }
		}));
		return files.filter(file => file?.version === CATALOG_VERSION && file.endpoint === key.endpoint && Array.isArray(file.models) && file.models.length && Number.isFinite(Date.parse(file.fetchedAt)))
			.sort((a, b) => Date.parse(b!.fetchedAt) - Date.parse(a!.fetchedAt))[0];
	}
	/** Returns the cached list at once, starting a background refresh when it is stale; only an empty cache waits for the network. */
	async get(key: ModelCatalogKey, fetchModels: CatalogFetch): Promise<ModelOption[]> {
		const cached = await this.read(key);
		if (!cached) {
			const standIn = await this.sameEndpoint(key);
			if (!standIn) return this.refresh(key, fetchModels);
			if (!this.refreshes.has(this.filename(key))) this.refresh(key, fetchModels).then(models => { if (JSON.stringify(models) !== JSON.stringify(standIn.models)) this.onChange(key); })
				.catch(error => this.warn(`Model catalog refresh failed: ${error instanceof Error ? error.message : "unknown error"}`));
			return standIn.models;
		}
		if (cached.version !== CATALOG_VERSION || this.now() - Date.parse(cached.fetchedAt) >= MODEL_CATALOG_FRESH_MS) this.refresh(key, fetchModels).catch(error => this.warn(`Model catalog refresh failed: ${error instanceof Error ? error.message : "unknown error"}`));
		return cached.models;
	}
	/** Fetches now with one shared request per account (conditional when ETags are saved), then saves the list and reports it if it changed. */
	refresh(key: ModelCatalogKey, fetchModels: CatalogFetch): Promise<ModelOption[]> {
		const file = this.filename(key), pending = this.refreshes.get(file);
		if (pending) return pending;
		const generation = this.generations.get(file) ?? 0;
		const refresh = span("models.catalog-fetch", undefined, async active => {
			const previous = await this.read(key);
			active.setAttributes({ conditional: previous?.version === CATALOG_VERSION && Boolean(previous.validators?.length) });
			let result = await fetchModels(previous?.version === CATALOG_VERSION ? previous.validators : undefined);
			if (!Array.isArray(result) && result.notModified && !previous) result = await fetchModels();
			const models = Array.isArray(result) ? result : result.notModified ? previous!.models : result.models;
			const validators = Array.isArray(result) ? undefined : result.notModified ? previous!.validators : result.validators;
			// A removal while fetching means the account is gone; do not resurrect its cache.
			if ((this.generations.get(file) ?? 0) !== generation) return models;
			try { await this.write(file, { version: CATALOG_VERSION, ...key, fetchedAt: new Date(this.now()).toISOString(), models, ...(validators?.length ? { validators } : {}) }); }
			catch (error) { this.warn(`Model catalog cache write failed: ${error instanceof Error ? error.message : "unknown error"}`); }
			if (previous && JSON.stringify(previous.models) !== JSON.stringify(models)) this.onChange(key);
			return models;
		}).finally(() => { if (this.refreshes.get(file) === refresh) this.refreshes.delete(file); });
		this.refreshes.set(file, refresh);
		return refresh;
	}
	/** Keeps serving the list, but re-checks it on the next read: a new key for the same account sees the same catalog, give or take. */
	async expire(key: ModelCatalogKey) {
		const cached = await this.read(key);
		if (cached) await this.write(this.filename(key), { ...cached, fetchedAt: new Date(0).toISOString() }).catch(() => {});
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
