import { IssueIsPullRequestError, type IssueDetails, type TaskIssueLink } from "../shared/issueView";
import { evaluateIssueWatch, issueWatchIntervalMs, issueWatchMessage, issueWatchReadFailureLimit, issueWatchUnreadableMessage, sameIssueWatch, type IssueWatchMessage, type IssueWatchState } from "../shared/issueWatch";
import { isRateLimited, rateLimitBackoffMs } from "../shared/pullRequestWatch";

export type IssueWatchTarget = { taskId: string; cwd: string; inactive: boolean; link: TaskIssueLink };
type Watched = IssueWatchTarget & { watch: IssueWatchState };
export type IssueWatcherPorts = {
	/** Every watched issue link, with the folder gh reads it from and whether the chat still takes wakes. */
	targets: () => IssueWatchTarget[];
	read: (cwd: string, repository: string, number: number) => Promise<IssueDetails>;
	/** Records a pass on one chat: the next watch (null ends it) and, when there is news, the update for its agent. */
	record: (taskId: string, link: { repository: string; number: number }, startedAt: string, next: IssueWatchState | null, update?: IssueWatchMessage) => void;
	/** Keeps every linked chat's snapshot current. */
	snapshot: (issue: IssueDetails) => void;
	now?: () => number;
};

const failureText = (reason: unknown) => { const error = reason as { message?: unknown; stderr?: unknown; cause?: { stderr?: unknown } }; return `${String(error?.message ?? "")}\n${String(error?.stderr ?? "")}\n${String(error?.cause?.stderr ?? "")}`; };

/**
 * Every two minutes each watched issue is read once for all the chats watching it, as the pull request watcher does. Each
 * chat hears about the issue closing or reopening and about other people's new comments. An issue GitHub fails to return
 * eight times in a row (or that turns out to be a pull request) ends the watch with one last update. A rate limit pauses
 * the passes, doubling up to 30 minutes, without counting.
 */
export class IssueWatcher {
	private timer?: ReturnType<typeof setInterval>;
	private first?: ReturnType<typeof setTimeout>;
	private sweeping?: Promise<void>;
	private closed = false;
	private readonly failures = new Map<string, number>();
	private pausedUntil = 0;
	private rateLimits = 0;
	constructor(private readonly ports: IssueWatcherPorts) {}
	private now() { return this.ports.now?.() ?? Date.now(); }
	/** The first pass waits a little so start-up stays quick. */
	start(firstDelayMs = 20_000) {
		this.first = setTimeout(() => void this.sweep(), firstDelayMs); this.first.unref?.();
		this.timer = setInterval(() => void this.sweep(), issueWatchIntervalMs); this.timer.unref?.();
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
			// A chat that takes no wakes cannot keep a watch: it ends without a read.
			if (target.inactive) { this.ports.record(target.taskId, link, link.watch.startedAt, null); continue; }
			const key = `${link.repository.toLowerCase()}#${link.number}`;
			groups.set(key, [...groups.get(key) ?? [], { ...target, watch: link.watch }]);
		}
		for (const key of this.failures.keys()) if (!groups.has(key)) this.failures.delete(key);
		for (const [key, targets] of groups) {
			if (this.closed) return;
			const { repository, number, url } = targets[0].link;
			let issue: IssueDetails;
			try { issue = await this.ports.read(targets[0].cwd, repository, number); }
			catch (reason) {
				if (isRateLimited(failureText(reason))) { this.rateLimits++; this.pausedUntil = this.now() + rateLimitBackoffMs(this.rateLimits); return; }
				const failures = (this.failures.get(key) ?? 0) + 1;
				if (!(reason instanceof IssueIsPullRequestError) && failures < issueWatchReadFailureLimit) { this.failures.set(key, failures); continue; }
				this.failures.delete(key);
				for (const target of targets) this.ports.record(target.taskId, target.link, target.watch.startedAt, null, issueWatchUnreadableMessage(number, url));
				continue;
			}
			this.rateLimits = 0; this.failures.delete(key);
			if (this.closed) return;
			this.ports.snapshot(issue);
			for (const target of targets) {
				const report = evaluateIssueWatch(target.watch, issue);
				// The first read only learns the state; the watch reports changes from there on.
				const news = report.comments.length > 0 || report.stateChange !== undefined;
				if (news) this.ports.record(target.taskId, target.link, target.watch.startedAt, report.exhausted ? null : report.next, issueWatchMessage({ number, url, report }));
				else if (!sameIssueWatch(report.next, target.watch)) this.ports.record(target.taskId, target.link, target.watch.startedAt, report.next);
			}
		}
	}
}
