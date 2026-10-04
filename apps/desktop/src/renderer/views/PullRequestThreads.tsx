import { useEffect, useRef, useState } from "react";
import type { PullRequestDetails } from "../../shared/pullRequests";
import type { PullRequestThreadsPage, ReviewThread } from "../../shared/pullRequestThreads";
import { MessageContent } from "../components/MessageContent";

function useReviewPage(projectId: string, request: PullRequestDetails, threadId?: string) {
	const api = window.phaseoDesktop?.workspace;
	const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]), [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
	const [confirmed, setConfirmed] = useState<{ page: number; value: PullRequestThreadsPage }>();
	const [loading, setLoading] = useState(true), [error, setError] = useState("");
	const pending = useRef(true), cursor = cursors[page];
	useEffect(() => {
		let active = true; pending.current = true; setLoading(true); setError("");
		if (!api) { pending.current = false; setLoading(false); setError("Open the desktop app to read reviews."); return; }
		void api.pullRequestThreads(projectId, { number: request.number, headOid: request.headOid, baseOid: request.baseOid, cursor, ...(threadId ? { type: "comments", threadId } : { type: "threads" }) }).then(value => {
			if (active) setConfirmed({ page, value });
		}, reason => { if (active) setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }).finally(() => { if (active) { pending.current = false; setLoading(false); } });
		return () => { active = false; };
	}, [api, projectId, request.number, request.headOid, request.baseOid, threadId, cursor, page, attempt]);
	function load(direction: "previous" | "next" | "refresh") {
		if (pending.current) return;
		if (direction === "next") {
			const next = confirmed?.value.nextCursor; if (!next) return;
			if (cursors.slice(0, page + 1).includes(next)) { setError("GitHub repeated a review page. Refresh details to continue."); return; }
			setCursors([...cursors.slice(0, page + 1), next]); setPage(page + 1);
		} else if (direction === "previous") { if (!page) return; setPage(page - 1); }
		pending.current = true; setLoading(true); setAttempt(value => value + 1);
	}
	return { confirmed, page, loading, error, load };
}
function ReviewPagination({ state, label }: { state: ReturnType<typeof useReviewPage>; label: string }) {
	return <nav className="proposal-pagination" aria-label={`${label} pages`}><span>Page {(state.confirmed?.page ?? 0) + 1} · {state.confirmed?.value.total ?? 0} {state.confirmed?.value.total === 1 ? label.toLowerCase().slice(0, -1) : label.toLowerCase()}</span><button type="button" disabled={state.loading || !state.page} onClick={() => state.load("previous")}>Previous {label.toLowerCase()}</button><button type="button" disabled={state.loading || Boolean(state.error) || !state.confirmed?.value.nextCursor} onClick={() => state.load("next")}>Next {label.toLowerCase()}</button></nav>;
}
function ReviewComments({ projectId, request, thread }: { projectId: string; request: PullRequestDetails; thread: ReviewThread }) {
	const state = useReviewPage(projectId, request, thread.id), value = state.confirmed?.value;
	return <section className="proposal-review-comments" aria-label="Review comments" aria-busy={state.loading}><div className="proposal-detail-actions"><h3>{thread.path}{thread.line ? `:${thread.line}` : thread.originalLine ? `:${thread.originalLine} (original)` : ""}</h3><button type="button" disabled={state.loading} onClick={() => state.load("refresh")}>{state.loading ? "Loading…" : state.error ? "Retry comments" : "Refresh comments"}</button></div>{state.loading && <p role="status">Loading review comments…</p>}{state.error && <p className="proposal-error" role="alert">{state.error}</p>}{value?.type === "comments" && <><ReviewPagination state={state} label="Comments" />{value.comments.length ? value.comments.map(comment => <article className="proposal-review-comment" key={comment.id}><header><strong>{comment.author}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></header>{comment.body ? <MessageContent text={comment.body} projectId={projectId} /> : <p>Empty comment.</p>}</article>) : <p>No comments on this page.</p>}</>}</section>;
}
export function PullRequestThreads({ projectId, request }: { projectId: string; request: PullRequestDetails }) {
	const state = useReviewPage(projectId, request), value = state.confirmed?.value;
	const [selected, setSelected] = useState("");
	useEffect(() => { if (value?.type === "threads") setSelected(current => value.threads.some(thread => thread.id === current) ? current : value.threads[0]?.id ?? ""); }, [value]);
	const thread = value?.type === "threads" ? value.threads.find(thread => thread.id === selected) : undefined;
	return <section className="proposal-reviews" aria-label="Review threads" aria-busy={state.loading}><div className="proposal-detail-actions"><h3>Review threads</h3><button type="button" disabled={state.loading} onClick={() => state.load("refresh")}>{state.loading ? "Loading…" : state.error ? "Retry threads" : "Refresh threads"}</button></div><p className="proposal-file-revision">Reviewing commit {request.headOid.slice(0, 12)}</p>{state.loading && <p role="status">Loading review threads…</p>}{state.error && <p role="alert" className="proposal-error">{state.error}</p>}{value?.type === "threads" && <><ReviewPagination state={state} label="Threads" /><div className="proposal-file-list proposal-thread-list" aria-label="Review-thread list">{value.threads.map(thread => <button type="button" key={thread.id} aria-pressed={thread.id === selected} onClick={() => setSelected(thread.id)}><strong>{thread.path}{thread.line ? `:${thread.line}` : ""}</strong><span>{thread.resolved ? "Resolved" : "Unresolved"}{thread.outdated ? " · Outdated" : ""} · {thread.side === "LEFT" ? "Base" : "Head"} · {thread.comments} {thread.comments === 1 ? "comment" : "comments"}</span></button>)}</div>{!value.threads.length && <p>No review threads on this page.</p>}{thread && <ReviewComments key={thread.id} projectId={projectId} request={request} thread={thread} />}</>}</section>;
}
