import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSaved, writeSaved } from "./saved";

describe("saved files", () => {
	let dir = "";
	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});
	const setup = async () => {
		dir = await mkdtemp(path.join(os.tmpdir(), "factory-saved-"));
		return path.join(dir, "factory.json");
	};

	it("starts fresh only when nothing was ever saved", async () => {
		expect(await readSaved(await setup())).toEqual({ value: null, from: "none" });
	});

	it("replaces the file whole and keeps the one it replaced as a backup", async () => {
		const file = await setup();
		await writeFile(file, JSON.stringify({ n: 1 }));
		await writeSaved(file, JSON.stringify({ n: 2 }));
		await writeSaved(file, JSON.stringify({ n: 3 }));
		expect(await readSaved(file)).toEqual({ value: { n: 3 }, from: "file" });
		expect(JSON.parse(await readFile(`${file}.bak`, "utf8"))).toEqual({ n: 1 });
		expect(existsSync(`${file}.saving`)).toBe(false);
	});

	it("never takes a half-written file for a first launch: it opens the backup and keeps the broken file", async () => {
		const file = await setup();
		await writeFile(`${file}.bak`, JSON.stringify({ repos: ["a/b"] }));
		await writeFile(file, '{"repos": ["a/b"');
		expect(await readSaved(file)).toEqual({ value: { repos: ["a/b"] }, from: "backup" });
		const kept = (await readdir(dir)).find((name) => name.startsWith("factory.json.unreadable-"));
		expect(await readFile(path.join(dir, kept!), "utf8")).toBe('{"repos": ["a/b"');
	});

	it("says so when there's no backup either, and still keeps the unreadable file", async () => {
		const file = await setup();
		await writeFile(file, "{");
		const loaded = await readSaved(file);
		expect(loaded.from).toBe("unreadable");
		expect(loaded.from === "unreadable" && existsSync(loaded.keptAt)).toBe(true);
	});
});
