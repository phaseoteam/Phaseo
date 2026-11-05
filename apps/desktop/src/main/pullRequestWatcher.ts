import type { PullRequestView, TaskPullRequestLink } from "../shared/pullRequestView";
import { evaluatePullRequestWatch, isRateLimited, pullRequestWatchClosedMessage, pullRequestWatchIntervalMs, pullRequestWatchMessage, pullRequestWatchReadFailureLimit, pullRequestWatchUnreadableMessage, rateLimitBackoffMs, sameWatch, type PullRequestWatchMessage, type PullRequestWatchState } from "../shared/pullRequestWatch";

export type PullRequestWatchTarget = { taskId: string; cwd: string; inactive: boolean; link: TaskPullRequestLink };
type Watched = PullRequestWatchTarget & { watch: PullRequestWatchState };
export type PullRequestWatcherPorts = {
	/** Every chat link, with the folder gh reads it from and whether the chat still takes wakes. */
	targets: () => PullRequestWatchTarget[];
	read: (cwd: string, repository: string, number: number) => Promise<PullRequestView>;
	/** Records a pass on one chat: the next watch (null ends it) and, when there is news, the update for its agent. */
	record: (taskId: string, link: { repository: string; number: number }, startedAt: string, next: PullRequestWatchState | null, update?: PullRequestWatchMessage) => void;
	/** Keeps every linked chat's snapshot current. */
	snapshot: (view: PullRequestView) => void;
	now?: () => number;
};

const failureText = (reason: unknown) => { const error = reason as { message?: unknown; cause?: { stderr?: unknown } }; return `${String(error?.message ?? "")}\n${String(error?.cause?.stderr ?? "")}`; };

/**
 * Pull request watches: every two minutes each watched pull request is read once for all the chats
 * watching it. Each chat hears about failed checks, required checks passing, other people's comments and reviews, and a new
 * conflict with its base. A merged pull request ends the watch quietly; a closed one, or one GitHub failed to return eight
 * times in a row, ends it with one last update. A rate limit pauses the passes, doubling up to 30 minutes, without counting.
 */
export class PullRequestWatcher {
	private timer?: ReturnType<typeof setInterval>;
	private sweeping?: Promise<void>;
	private closed = false;
	private readonly failures = new Map<string, number>();
	private pausedUntil = 0;
	private rateLimits = 0;
	constructor(private readonly ports: PullRequestWatcherPorts) {}
	private now() { return this.ports.now?.() ?? Date.now(); }
	private first?: ReturnType<typeof setTimeout>;
	/** The first pass waits a little so start-up stays quick. */
	start(firstDelayMs = 15_000) {
		this.first = setTimeout(() => void this.sweep(), firstDelayMs); this.first.unref?.();
		this.timer = setInterval(() => void this.sweep(), pullRequestWatchIntervalMs); this.timer.unref?.();
	}
	async close() { this.closed = true; clearTimeout(this.first); clearInterval(this.timer); await this.sweeping?.catch(() => undefined); }
	/** One pass; overlapping calls share it. */
	sweep(): Promise<void> {
		if (this.closed) return Promise.resolve();
		return this.sweeping ??= this.pass().finally(() => { this.sweeping = undefined; });
	}
	private async pass() {
		if (this.now() < this.pausedUntil) return;
		const groups = new Map<string, Watched[]>();
		for (const target of this.ports.targets()) {
			const { link } = target;
			if (!link.watching || !link.watch) continue;
			const watched = { ...target, watch: link.watch };
			// A merged pull request cannot reopen, and a chat that takes no wakes cannot keep a watch: both end without a read.
			if (link.snapshot?.state === "merged" || target.inactive) { this.ports.record(target.taskId, link, link.watch.startedAt, null); continue; }
			const key = `${link.repository.toLowerCase()}#${link.number}`;
			groups.set(key, [...groups.get(key) ?? [], watched]);
		}
		for (const key of this.failures.keys()) if (!groups.has(key)) this.failures.delete(key);
		for (const [key, targets] of groups) {
			if (this.closed) return;
			const { repository, number, url } = targets[0].link;
			let view: PullRequestView;
			try { view = await this.ports.read(targets[0].cwd, repository, number); }
			catch (reason) {
				if (isRateLimited(failureText(reason))) { this.rateLimits++; this.pausedUntil = this.now() + rateLimitBackoffMs(this.rateLimits); return; }
				const failures = (this.failures.get(key) ?? 0) + 1;
				if (failures < pullRequestWatchReadFailureLimit) { this.failures.set(key, failures); continue; }
				this.failures.delete(key);
				for (const target of targets) this.ports.record(target.taskId, target.link, target.watch.startedAt, null, pullRequestWatchUnreadableMessage(number, url));
				continue;
			}
			this.rateLimits = 0; this.failures.delete(key);
			if (this.closed) return;
			this.ports.snapshot(view);
			for (const target of targets) {
				if (view.state === "MERGED") { this.ports.record(target.taskId, target.link, target.watch.startedAt, null); continue; }
				if (view.state === "CLOSED") { this.ports.record(target.taskId, target.link, target.watch.startedAt, null, pullRequestWatchClosedMessage(number, url)); continue; }
				const report = evaluatePullRequestWatch(target.watch, view, view.comments);
				if (report.changes.length) this.ports.record(target.taskId, target.link, target.watch.startedAt, report.exhausted ? null : report.next, pullRequestWatchMessage({ number, url, base: view.base, headSha: report.next.headSha, report }));
				else if (!sameWatch(report.next, target.watch)) this.ports.record(target.taskId, target.link, target.watch.startedAt, report.next);
			}
		}
	}
}
