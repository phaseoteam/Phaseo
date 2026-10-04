import { useEffect, useRef, useState } from "react";
import type { GitCommand, GitHunkReview, GitReview } from "../../shared/workspace";
import { CodeBlock } from "./MessageContent";

export function GitHunkPanel({ projectId, filename, revision, busy, onCommand }: { projectId: string; filename: string; revision: GitReview; busy: boolean; onCommand: (command: GitCommand) => Promise<void> }) {
	const [reviews, setReviews] = useState<GitHunkReview[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [refresh, setRefresh] = useState(0);
	const pending = useRef(false);
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return; let active = true; setLoading(true); setError("");
		void Promise.all([api.gitHunks(projectId, filename, false), api.gitHunks(projectId, filename, true)]).then(value => { if (active) setReviews(value); }, reason => { if (active) setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [api, projectId, filename, revision, refresh]);
	async function change(review: GitHunkReview, index: number) {
		if (pending.current || busy || loading) return; pending.current = true;
		try { await onCommand({ type: review.staged ? "unstage-hunk" : "stage-hunk", filename, index, hash: review.hash }); }
		finally { pending.current = false; }
	}
	return <section className="git-hunk-panel" aria-label={`Changes in ${filename}`} aria-busy={loading || busy}>
		<div className="project-toolbar"><h2>{filename}</h2><button type="button" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Refresh changes</button></div>
		{loading && <p className="task-muted" role="status">Loading changes…</p>}
		{error && <p role="alert">{error}</p>}
		{!loading && !error && !reviews.some(review => review.hunks.length) && <p className="task-muted">No individual text changes. Use the file actions above.</p>}
		{!loading && !error && reviews.filter(review => review.hunks.length).map(review => <div key={String(review.staged)}><h3>{review.staged ? "Staged changes" : "Unstaged changes"}</h3>{review.hunks.map(hunk => <div className="git-hunk" key={`${review.hash}:${hunk.index}`}><div className="project-toolbar"><span>Change {hunk.index + 1}</span><button type="button" disabled={busy} aria-label={`${review.staged ? "Unstage" : "Stage"} change ${hunk.index + 1} in ${filename}`} onClick={() => void change(review, hunk.index)}>{review.staged ? "Unstage change" : "Stage change"}</button></div><CodeBlock text={hunk.text} language="diff" /></div>)}</div>)}
	</section>;
}
