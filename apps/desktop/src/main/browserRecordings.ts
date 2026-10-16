import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { browserRecordingExtension, browserRecordingLimit, type BrowserRecording } from "../shared/browser";

/** Screen recordings of browser tabs, saved in one folder of the app's data; only files there can be revealed. */
export class BrowserRecordings {
	constructor(private readonly directory: string, private readonly now: () => number = Date.now) {}
	async save(mimeType: unknown, data: unknown): Promise<BrowserRecording> {
		const extension = browserRecordingExtension(mimeType);
		if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new Error("The recording is empty.");
		if (data.byteLength > browserRecordingLimit) throw new Error("The recording is larger than 1 GB.");
		await mkdir(this.directory, { recursive: true });
		for (let attempt = 0; attempt < 100; attempt++) {
			const file = path.join(this.directory, `browser-recording-${(this.now() + attempt).toString(36)}.${extension}`);
			try { await writeFile(file, data, { flag: "wx" }); return { path: file, mimeType: String(mimeType).split(";")[0].trim().toLowerCase(), size: data.byteLength }; }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
		}
		throw new Error("The recording could not be saved.");
	}
	/** A saved recording's path, checked to be a file in the recordings folder. */
	async resolve(value: unknown): Promise<string> {
		if (typeof value !== "string" || !value || value.length > 4096) throw new Error("Invalid recording.");
		const file = path.resolve(value), relative = path.relative(path.resolve(this.directory), file);
		if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes(path.sep) || !/^browser-recording-[a-z0-9]+\.(?:mp4|webm)$/.test(relative)) throw new Error("Invalid recording.");
		const info = await stat(file).catch(() => undefined);
		if (!info?.isFile()) throw new Error("That recording no longer exists.");
		return file;
	}
}
