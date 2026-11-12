import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { git } from "./gitProcess";
import { ghFailure, runGh } from "./projectPullRequestView";
import { parsePullRequestStacks, stackActionLayers, stackHeadsMatch, validatePullRequestStackAction, type PullRequestStack, type PullRequestStackLayer, type PullRequestStackRead } from "../shared/pullRequestStacks";
import { validRepository } from "../shared/pullRequestView";

const cacheMs = 60_000;
const cache = new Map<string, { at: number; read: Promise<PullRequestStack | null> }>();

/** The repository's default branch as the checkout knows it (origin/HEAD), for the stacked-base mark. */
async function defaultBranch(root: string) {
	try { return (await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "") || undefined; } catch { return undefined; }
}

/**
 * The native GitHub stack a pull request is in, or null. The stacks API is a public
 * preview: a host or repository without it answers 404, which means "no stack" rather than a failure. Reads are
 * cached for a minute because rows and the header ask for the same stack.
 */
export async function readPullRequestStack(root: string, repository: string, number: number, fresh = false): Promise<PullRequestStackRead> {
	if (!validRepository(repository) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new Error("Invalid pull request.");
	const key = `${repository.toLowerCase()}#${number}`, cached = cache.get(key);
	let read = !fresh && cached && Date.now() - cached.at < cacheMs ? cached.read : undefined;
	if (!read) {
		read = (async () => {
			let output: string;
			try { output = await runGh(root, ["api", "--hostname", "github.com", `repos/${repository}/stacks?pull_request=${number}`]); }
			catch (reason) {
				const stderr = String((reason as { stderr?: unknown }).stderr ?? "");
				if (/HTTP 404|Not Found/i.test(stderr)) return null;
				throw new Error(ghFailure(stderr, "Could not read the stack."), { cause: reason });
			}
			let parsed: unknown;
			try { parsed = JSON.parse(output); } catch { throw new Error("GitHub returned an unreadable stack."); }
			const stack = parsePullRequestStacks(parsed);
			if (!stack) return null;
			// The listing names its layers; the stack itself carries their heads and titles.
			try { return parsePullRequestStacks(JSON.parse(await runGh(root, ["api", "--hostname", "github.com", `repos/${repository}/stacks/${stack.number}`]))) ?? stack; } catch { return stack; }
		})();
		cache.set(key, { at: Date.now(), read });
		read.catch(() => { if (cache.get(key)?.read === read) cache.delete(key); });
	}
	const [stack, base] = await Promise.all([read, defaultBranch(root)]);
	return { stack, ...(base ? { defaultBranch: base } : {}), readAt: new Date().toISOString() };
}
export function forgetPullRequestStack(repository: string, numbers: number[]) { for (const number of numbers) cache.delete(`${repository.toLowerCase()}#${number}`); }

type GitRunner = (args: string[], allowFailure?: boolean) => Promise<{ code: number; stdout: string; stderr: string }>;
function gitIn(cwd: string, env: NodeJS.ProcessEnv): GitRunner {
	return (args, allowFailure = false) => new Promise((resolve, reject) => {
		execFile("git", ["--no-pager", ...args], { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
			const code = error ? typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1 : 0;
			if (error && !allowFailure) reject(Object.assign(new Error(String(stderr).trim() || "git failed"), { stderr: String(stderr) }));
			else resolve({ code, stdout: String(stdout), stderr: String(stderr) });
		});
	});
}
export class StackRebaseError extends Error {}

/**
 * GitHub's own "Rebase stack": every open layer, bottom to top, onto the new head of the
 * layer below it, moving only that layer's own commits (`git rebase --onto <new parent> <old parent>`). It works in a
 * throwaway repository that borrows the checkout's objects, so the person's checkout never moves, and pushes each
 * layer with a lease on the head that was reviewed so a push that landed meanwhile is refused, not overwritten.
 * `remote` is the project's origin URL, so the push uses the credentials the person already pushes with.
 */
export async function cascadeRebaseStack(input: { root: string; remote: string; base: string; layers: { number: number; headBranch: string; headSha: string }[] }) {
	const first = input.layers[0];
	if (!first) return 0;
	const directory = await mkdtemp(path.join(tmpdir(), "phaseo-stack-rebase-"));
	try {
		const objects = path.resolve(input.root, (await git(input.root, ["rev-parse", "--git-common-dir"])).trim(), "objects");
		const name = (await git(input.root, ["config", "user.name"]).catch(() => "")).trim() || "Phaseo", email = (await git(input.root, ["config", "user.email"]).catch(() => "")).trim() || "noreply@phaseo.app";
		const run = gitIn(directory, { GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email });
		const failed = (step: string, number: number, completed: number) => (reason: unknown) => { throw new StackRebaseError(`Stack rebase stopped at #${number} while ${step}. ${completed} ${completed === 1 ? "layer was" : "layers were"} rebased.`, { cause: reason }); };
		await run(["init", "--quiet"]).catch(failed("preparing", first.number, 0));
		await writeFile(path.join(directory, ".git", "objects", "info", "alternates"), `${objects}\n`).catch(failed("preparing", first.number, 0));
		await run(["remote", "add", "origin", input.remote]).catch(failed("preparing", first.number, 0));
		await run(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${input.base}:refs/remotes/origin/${input.base}`, ...input.layers.map(layer => `+refs/heads/${layer.headBranch}:refs/remotes/origin/${layer.headBranch}`)]).catch(failed("fetching", first.number, 0));
		let parentOld = `origin/${input.base}`, parentNew = `origin/${input.base}`;
		for (const [index, layer] of input.layers.entries()) {
			// The bottom layer's old parent is where it forked from the base; above it, the reviewed head of the layer below.
			const upstream = index === 0 ? (await run(["merge-base", parentOld, layer.headSha]).catch(failed("reading the fork point", layer.number, index))).stdout.trim() : parentOld;
			await run(["checkout", "--quiet", "--detach", layer.headSha]).catch(failed("checking out", layer.number, index));
			const rebase = await run(["rebase", "--quiet", "--onto", parentNew, upstream], true);
			if (rebase.code !== 0) {
				await run(["rebase", "--abort"], true);
				throw new StackRebaseError(`#${layer.number} conflicts with the layer below it. ${index} ${index === 1 ? "layer was" : "layers were"} rebased; resolve #${layer.number} by hand and push.`);
			}
			const rebased = (await run(["rev-parse", "HEAD"]).catch(failed("rebasing", layer.number, index))).stdout.trim();
			if (rebased !== layer.headSha) await run(["push", "--quiet", `--force-with-lease=refs/heads/${layer.headBranch}:${layer.headSha}`, "origin", `${rebased}:refs/heads/${layer.headBranch}`]).catch(failed("pushing", layer.number, index));
			parentOld = layer.headSha; parentNew = rebased;
		}
		return input.layers.length;
	} finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined); }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Merge stack or Rebase stack. Re-reads the stack first and refuses when it moved since the
 * person looked: a different stack, a layer that is no longer where it was, or any head other than the one reviewed.
 */
export async function runPullRequestStackAction(root: string, repository: string, value: unknown) {
	const request = validatePullRequestStackAction(value);
	const { stack } = await readPullRequestStack(root, repository, request.number, true);
	if (!stack || stack.number !== request.stackNumber) throw new Error("The stack changed. Refresh it before trying again.");
	const { target, layers, reason } = stackActionLayers(stack, request.number, request.action);
	if (request.action === "rebase" && stack.layers.at(-1)?.number !== request.number) throw new Error("The stack changed. Refresh it before trying again.");
	if (reason || !target) throw new Error(reason ?? "The stack changed. Refresh it before trying again.");
	if (!stackHeadsMatch(layers, request.expectedHeads)) throw new Error("The stack changed. Refresh it before trying again.");
	try {
		if (request.action === "rebase") {
			let remote: string;
			try { remote = (await git(root, ["remote", "get-url", "origin"])).trim(); } catch { throw new Error("This project has no origin remote to push the stack to."); }
			await cascadeRebaseStack({ root, remote, base: stack.base, layers: layers.map((layer: PullRequestStackLayer) => ({ number: layer.number, headBranch: layer.headBranch, headSha: layer.headSha! })) });
			return { message: "Stack rebased" };
		}
		let output: string;
		try { output = await runGh(root, ["api", "--hostname", "github.com", "-X", "PUT", `repos/${repository}/pulls/${target.number}/merge-async`, "-f", `merge_method=${request.method ?? "merge"}`, "-f", "merge_action=default", "-f", `sha=${target.headSha}`]); }
		catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, "GitHub refused the stack merge. Check the stack's branch rules and merge requirements."), { cause: reason }); }
		const status = (text: string) => { try { const parsed = JSON.parse(text) as { status?: unknown; details?: { uuid?: unknown } }; return { status: String(parsed.status), uuid: typeof parsed.details?.uuid === "string" ? parsed.details.uuid : undefined }; } catch { throw new Error("GitHub returned an unreadable stack merge response."); } };
		let result = status(output);
		const deadline = Date.now() + 5 * 60_000;
		for (let attempt = 0; result.status === "pending" && Date.now() < deadline; attempt++) {
			if (!result.uuid || !/^[A-Za-z0-9-]{1,100}$/.test(result.uuid)) throw new Error("GitHub returned an unreadable stack merge response.");
			await sleep(Math.min(1000 * 2 ** attempt, 10_000));
			result = status(await runGh(root, ["api", "--hostname", "github.com", `repos/${repository}/pulls/${target.number}/merge-async/${result.uuid}`]));
		}
		if (result.status === "pending") throw new Error("The merge is still running on GitHub. Check its status there before submitting another request.");
		if (result.status === "failed") throw new Error("GitHub refused the stack merge. Check the stack's branch rules and merge requirements.");
		return { message: "Stack merge request completed" };
	} finally { forgetPullRequestStack(repository, stack.layers.map(layer => layer.number)); }
}
