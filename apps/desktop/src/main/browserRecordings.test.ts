import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserRecordings } from "./browserRecordings";

const roots: string[] = [];
const recordings = () => { const root = mkdtempSync(path.join(tmpdir(), "phaseo-recordings-")); roots.push(root); return { root, service: new BrowserRecordings(path.join(root, "recordings"), () => 1_700_000_000_000) }; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("browser recordings", () => {
	it("saves MP4 and WebM recordings without overwriting earlier ones", async () => {
		const { service } = recordings();
		const first = await service.save("video/mp4;codecs=avc1", new Uint8Array([1, 2, 3]));
		const second = await service.save("video/mp4", new Uint8Array([4]));
		const webm = await service.save("video/webm;codecs=vp9", new Uint8Array([5]));
		expect(first).toMatchObject({ mimeType: "video/mp4", size: 3 });
		expect(path.basename(first.path)).toMatch(/^browser-recording-[a-z0-9]+\.mp4$/);
		expect(second.path).not.toBe(first.path);
		expect(webm.path.endsWith(".webm")).toBe(true);
		expect([...readFileSync(first.path)]).toEqual([1, 2, 3]);
	});
	it("refuses other formats and empty recordings", async () => {
		const { service } = recordings();
		await expect(service.save("text/html", new Uint8Array([1]))).rejects.toThrow("Invalid recording format.");
		await expect(service.save("video/webm", new Uint8Array())).rejects.toThrow("The recording is empty.");
		await expect(service.save("video/webm", "bytes")).rejects.toThrow("The recording is empty.");
	});
	it("reveals only saved recordings in its own folder", async () => {
		const { root, service } = recordings();
		const saved = await service.save("video/webm", new Uint8Array([1]));
		expect(await service.resolve(saved.path)).toBe(path.resolve(saved.path));
		writeFileSync(path.join(root, "secret.txt"), "x");
		for (const bad of [path.join(root, "secret.txt"), path.join(root, "recordings", "..", "secret.txt"), path.join(root, "recordings", "other.mp4"), path.join(root, "recordings"), "", 3]) await expect(service.resolve(bad)).rejects.toThrow();
		await expect(service.resolve(path.join(root, "recordings", "browser-recording-zzz.mp4"))).rejects.toThrow("That recording no longer exists.");
	});
});
