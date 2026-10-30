import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareTriageCheckout, writeTriagePlaybook, type TriageGit } from "./triage";

const commit = "821b26a8e7c9d1f2a3b4c5d6e7f8091a2b3c4d5e", main = "0123456789abcdef0123456789abcdef01234567";

/** A stand-in for git: records each call, makes `.git` on init, and answers fetches from what GitHub "has". */
function fakeGit(options: { has?: string[]; offline?: boolean } = {}) {
	const calls: string[] = [], fetched = new Set<string>();
	const git: TriageGit = async (cwd, args) => {
		// Like execFile, git can't start in a folder that doesn't exist.
		if (!existsSync(cwd)) throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
		calls.push(args.join(" "));
		const fail = (stderr: string) => { throw Object.assign(new Error("git failed"), { stderr }); };
		if (args[0] === "init") { mkdirSync(path.join(cwd, ".git", "info"), { recursive: true }); return ""; }
		if (args[0] === "ls-remote") return options.offline ? fail("fatal: unable to access 'https://github.com/phaseoteam/Phaseo.git/': Could not resolve host: github.com") : `${main}\trefs/heads/main\n`;
		if (args[0] === "fetch") {
			const wanted = args.at(-1)!;
			if (options.offline) fail("fatal: unable to access 'https://github.com/phaseoteam/Phaseo.git/': Could not resolve host: github.com");
			if (!(options.has ?? [commit, main]).includes(wanted)) fail(`error: Server does not allow request for unadvertised object ${wanted}`);
			fetched.add(wanted); return "";
		}
		if (args[0] === "cat-file") { if (!fetched.has(args[2].replace("^{commit}", ""))) fail("fatal: Not a valid object name"); return ""; }
		return "";
	};
	return { git, calls };
}
async function withRoot(test: (root: string) => Promise<void>) {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-triage-"));
	try { await test(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("triage checkout", () => {
	it("shallow-fetches the build's own commit once and reuses the checkout afterwards", () => withRoot(async root => {
		const { git, calls } = fakeGit();
		const first = await prepareTriageCheckout(root, commit, git);
		expect(first).toEqual({ directory: path.join(root, "phaseo-821b26a8e7c9"), commit, exact: true });
		expect(calls).toEqual([
			"init -q", "remote add origin https://github.com/phaseoteam/Phaseo.git",
			`fetch --depth 1 --no-tags origin ${commit}`, `-c advice.detachedHead=false checkout -q -B triage-821b26a ${commit}`,
		]);
		expect(readFileSync(path.join(first.directory, ".git", "info", "exclude"), "utf8")).toBe(".phaseo-triage/\n");
		calls.length = 0;
		expect(await prepareTriageCheckout(root, commit, git)).toEqual(first);
		expect(calls).toEqual([`cat-file -e ${commit}^{commit}`, "rev-parse --verify HEAD"]);
	}));
	it("falls back to main, marked not exact, when GitHub does not have the build's commit or the build has none", () => withRoot(async root => {
		const { git, calls } = fakeGit({ has: [main] });
		expect(await prepareTriageCheckout(root, commit, git)).toEqual({ directory: path.join(root, "phaseo-0123456789ab"), commit: main, exact: false });
		expect(calls).toContain("ls-remote https://github.com/phaseoteam/Phaseo.git refs/heads/main");
		expect(await prepareTriageCheckout(root, undefined, fakeGit().git)).toMatchObject({ commit: main, exact: false });
		// A fresh profile has no triage folder yet.
		expect(await prepareTriageCheckout(path.join(root, "fresh", "triage"), undefined, fakeGit().git)).toMatchObject({ commit: main, exact: false });
	}));
	it("reports a network failure instead of quietly using another version", () => withRoot(async root => {
		await expect(prepareTriageCheckout(root, commit, fakeGit({ offline: true }).git)).rejects.toThrow("Could not fetch the Phaseo source: unable to access");
		await expect(prepareTriageCheckout(root, undefined, fakeGit({ offline: true }).git)).rejects.toThrow("Could not reach phaseoteam/Phaseo on GitHub");
	}));
});

describe("triage playbooks", () => {
	it("are written only inside the checkout's excluded triage folder", () => withRoot(async root => {
		mkdirSync(path.join(root, ".git", "info"), { recursive: true });
		const file = await writeTriagePlaybook(root, ".phaseo-triage/playbook-20261030-140509.md", "# Playbook\n");
		expect(file).toBe(path.join(root, ".phaseo-triage", "playbook-20261030-140509.md"));
		expect(readFileSync(file, "utf8")).toBe("# Playbook\n");
		expect(readFileSync(path.join(root, ".git", "info", "exclude"), "utf8")).toBe(".phaseo-triage/\n");
		await writeTriagePlaybook(root, ".phaseo-triage/playbook-20261030-140510.md", "again");
		expect(readFileSync(path.join(root, ".git", "info", "exclude"), "utf8")).toBe(".phaseo-triage/\n");
		await expect(writeTriagePlaybook(root, "../outside.md", "x")).rejects.toThrow("Invalid playbook name");
		expect(existsSync(path.join(root, "..", "outside.md"))).toBe(false);
	}));
});
