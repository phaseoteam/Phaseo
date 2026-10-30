import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { triagePlaybookPattern, triageSourceRepository } from "../shared/triage";

export type TriageGit = (cwd: string, args: string[]) => Promise<string>;

/** Git for a fetch that can take minutes on a slow connection; it never asks for credentials (the source is public). */
const runGit: TriageGit = (cwd, args) => new Promise((resolve, reject) => {
	execFile("git", ["-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never", ...args], { cwd, windowsHide: true, timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } }, (error, stdout, stderr) => {
		if (error) reject(Object.assign(error, { stderr: String(stderr ?? "") })); else resolve(String(stdout));
	});
});

const gitDetail = (error: unknown) => (error as { stderr?: string }).stderr?.trim().split("\n").at(-1)?.replace(/^fatal: /, "");
const isCommit = (value: string | undefined): value is string => !!value && /^[0-9a-f]{40}$/.test(value);

/**
 * The source at `commit`, in `<root>/phaseo-<first 12 characters>`: one shallow fetch of that commit, reused by every later
 * triage of the same build. A commit GitHub doesn't have (a local build) or no commit at all falls back to main, marked not exact.
 */
export async function prepareTriageCheckout(root: string, commit: string | undefined, git: TriageGit = runGit, repository = triageSourceRepository): Promise<{ directory: string; commit: string; exact: boolean }> {
	const url = `https://github.com/${repository}.git`;
	if (isCommit(commit)) {
		try { return { directory: await checkout(root, url, commit, git), commit, exact: true }; }
		catch (error) { if (!(error instanceof MissingCommitError)) throw error; }
	}
	let main: string | undefined;
	// ls-remote runs in the root, which a fresh profile doesn't have yet.
	await mkdir(root, { recursive: true });
	try { main = (await git(root, ["ls-remote", url, "refs/heads/main"])).split(/\s/)[0]; }
	catch (error) { throw new Error(`Could not reach ${repository} on GitHub${gitDetail(error) ? `: ${gitDetail(error)}` : "."}`, { cause: error }); }
	if (!isCommit(main)) throw new Error(`${repository} has no main branch to fall back to.`);
	return { directory: await checkout(root, url, main, git), commit: main, exact: false };
}

class MissingCommitError extends Error {}

async function checkout(root: string, url: string, commit: string, git: TriageGit) {
	const directory = path.join(root, `phaseo-${commit.slice(0, 12)}`);
	await mkdir(directory, { recursive: true });
	// A checkout from an earlier triage is reused as it is, including the agent's changes; an interrupted fetch is finished.
	if (existsSync(path.join(directory, ".git"))) {
		try { await git(directory, ["cat-file", "-e", `${commit}^{commit}`]); await git(directory, ["rev-parse", "--verify", "HEAD"]); return directory; } catch { /* Fetched only partly; fetch again. */ }
	}
	await git(directory, ["init", "-q"]);
	try { await git(directory, ["remote", "add", "origin", url]); } catch { await git(directory, ["remote", "set-url", "origin", url]); }
	try { await git(directory, ["fetch", "--depth", "1", "--no-tags", "origin", commit]); }
	catch (error) {
		const detail = gitDetail(error) ?? "";
		// GitHub answers "not our ref" (or "couldn't find remote ref") for a commit it doesn't have; anything else is a real failure.
		if (/not our ref|couldn't find remote ref|no such remote ref|unadvertised object/i.test(detail)) throw new MissingCommitError(detail);
		throw new Error(`Could not fetch the Phaseo source${detail ? `: ${detail}` : "."}`, { cause: error });
	}
	await git(directory, ["-c", "advice.detachedHead=false", "checkout", "-q", "-B", `triage-${commit.slice(0, 7)}`, commit]);
	await excludeTriageFolder(directory);
	return directory;
}

/** Keeps the playbooks out of `git status` and out of any commit the agent makes. */
async function excludeTriageFolder(directory: string) {
	const file = path.join(directory, ".git", "info", "exclude");
	const current = await readFile(file, "utf8").catch(() => "");
	if (current.split(/\r?\n/).includes(".phaseo-triage/")) return;
	await mkdir(path.dirname(file), { recursive: true });
	await appendFile(file, `${current && !current.endsWith("\n") ? "\n" : ""}.phaseo-triage/\n`);
}

/** Writes a playbook at a name triagePlaybookName made, inside the checkout. */
export async function writeTriagePlaybook(checkout: string, name: string, content: string) {
	if (!triagePlaybookPattern.test(name)) throw new Error("Invalid playbook name.");
	const file = path.join(checkout, ...name.split("/"));
	await mkdir(path.dirname(file), { recursive: true });
	await excludeTriageFolder(checkout).catch(() => undefined);
	await writeFile(file, content, "utf8");
	return file;
}
