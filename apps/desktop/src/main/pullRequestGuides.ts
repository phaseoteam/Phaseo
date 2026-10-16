import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { guideDiffText, guidePrompt, normaliseGuide, parseGuideReply, parseUnifiedDiff, validStoredGuide, type PullRequestGuide, type PullRequestGuideResult } from "../shared/pullRequestGuide";
import type { PullRequestView } from "../shared/pullRequestView";

type Complete = (input: { system: string; user: string; maxTokens: number; timeoutMs: number; label: string }) => Promise<{ reply: string | undefined; model: string }>;
type Run = { headSha: string; promise: Promise<PullRequestGuide> };

/**
 * T3's review guides, written with the title model through the person's Phaseo account. Writing is explicit and the
 * result is stored per pull request with the head it was written for, so opening the Guide tab never spends a model
 * call; a push leaves the guide in place and the reader sees it as written before the latest push. A run belongs to
 * the app rather than to the window that asked, so leaving the tab does not stop it.
 */
export class PullRequestGuides {
	private readonly runs = new Map<string, Run>();
	private readonly failures = new Map<string, { headSha: string; error: string }>();
	constructor(private readonly directory: string, private readonly complete: Complete, private readonly diff: (root: string, view: PullRequestView) => Promise<string>) {}

	private key(view: Pick<PullRequestView, "repository" | "number">) { return `${view.repository.toLowerCase()}#${view.number}`; }
	private file(view: Pick<PullRequestView, "repository" | "number">) { return path.join(this.directory, `${createHash("sha256").update(this.key(view)).digest("hex").slice(0, 32)}.json`); }

	async stored(view: Pick<PullRequestView, "repository" | "number">): Promise<PullRequestGuide | null> {
		try { const value: unknown = JSON.parse(await readFile(this.file(view), "utf8")); return validStoredGuide(value) ? value : null; } catch { return null; }
	}

	async get(view: PullRequestView): Promise<PullRequestGuideResult> {
		const key = this.key(view), failure = this.failures.get(key);
		return { guide: await this.stored(view), running: this.runs.has(key), ...(failure && failure.headSha === view.headOid ? { error: failure.error } : {}), currentHeadSha: view.headOid };
	}

	/** Writes a guide for the current head and resolves once it is stored; joins a run already going for that head. */
	async generate(root: string, view: PullRequestView): Promise<PullRequestGuideResult> {
		const key = this.key(view);
		let run = this.runs.get(key);
		if (!run || run.headSha !== view.headOid) {
			const promise = this.write(root, view);
			run = { headSha: view.headOid, promise };
			this.runs.set(key, run); this.failures.delete(key);
			const current = run;
			void promise.then(() => undefined, reason => { this.failures.set(key, { headSha: view.headOid, error: reason instanceof Error ? reason.message : String(reason) }); }).finally(() => { if (this.runs.get(key) === current) this.runs.delete(key); });
		}
		try { await run.promise; } catch { /* Reported by get. */ }
		return this.get(view);
	}

	private async write(root: string, view: PullRequestView): Promise<PullRequestGuide> {
		const files = parseUnifiedDiff(await this.diff(root, view));
		if (!files.length) throw new Error("This pull request has no changed files to tour.");
		const shown = guideDiffText(files);
		const prompt = guidePrompt({ number: view.number, title: view.title, body: view.body, base: view.base, head: view.head, diff: shown.text, truncated: shown.truncated });
		const { reply, model } = await this.complete({ ...prompt, maxTokens: 8000, timeoutMs: 180_000, label: "The guide model" });
		if (!reply) throw new Error("The model returned an empty guide.");
		let raw: unknown;
		try { raw = parseGuideReply(reply); } catch { throw new Error("The model's guide could not be read. Try again, or choose another title model in Settings → General."); }
		const stops = normaliseGuide(raw, files, shown.shown);
		const guide: PullRequestGuide = { headSha: view.headOid, generatedAt: new Date().toISOString(), model, stops, ...(shown.truncated ? { truncated: true } : {}) };
		await mkdir(this.directory, { recursive: true });
		const target = this.file(view), temporary = `${target}.${process.pid}.tmp`;
		await writeFile(temporary, JSON.stringify(guide)); await rename(temporary, target);
		return guide;
	}
}
