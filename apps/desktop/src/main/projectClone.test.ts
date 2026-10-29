import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cloneRepository, cloneSource } from "./projectClone";

describe("cloning a project", () => {
	it("accepts HTTPS and SSH addresses and names the folder after the repository", () => {
		expect(cloneSource(" https://github.com/phaseo/app.git ")).toEqual({ url: "https://github.com/phaseo/app.git", name: "app" });
		expect(cloneSource("git@github.com:phaseo/desktop.git")).toEqual({ url: "git@github.com:phaseo/desktop.git", name: "desktop" });
		expect(cloneSource("ssh://git@example.com:2222/team/tools")).toMatchObject({ name: "tools" });
	});
	it("refuses transports that can run commands or read local files", () => {
		for (const value of ["ext::sh -c touch% /tmp/x", "file:///etc", "/home/me/repo", "-uhelp", "http://example.com/a.git", "https://example.com", "", 42]) expect(() => cloneSource(value)).toThrow();
	});
	it("clones into a new folder and reports Git's reason when it fails", async () => {
		const parent = mkdtempSync(path.join(tmpdir(), "phaseo-clone-"));
		try {
			const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
			await expect(cloneRepository("https://github.com/phaseo/app.git", parent, run as never)).resolves.toBe(path.join(parent, "app"));
			expect(run).toHaveBeenCalledWith("git", expect.arrayContaining(["clone", "--", "https://github.com/phaseo/app.git", path.join(parent, "app")]), expect.objectContaining({ cwd: parent }));
			const failing = vi.fn(async () => { throw Object.assign(new Error("exit 128"), { stderr: "Cloning into 'app'...\nfatal: repository not found" }); });
			await expect(cloneRepository("https://github.com/phaseo/app.git", parent, failing as never)).rejects.toThrow("Could not clone https://github.com/phaseo/app.git: repository not found");
			mkdirSync(path.join(parent, "taken"));
			await expect(cloneRepository("https://github.com/phaseo/taken", parent, run as never)).rejects.toThrow("already exists");
		} finally { rmSync(parent, { recursive: true, force: true }); }
	});
});
