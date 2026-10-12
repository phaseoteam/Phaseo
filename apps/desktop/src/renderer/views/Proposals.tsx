import { PullRequestDetail, reviewLabels, checkLabels } from "./PullRequestDetail";
import { Select } from "../components/Select";
import { useEffect, useRef, useState } from "react";
import type { ProjectPullRequests, PullRequest } from "../../shared/pullRequests";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { useBackgroundRefresh } from "../lib/useBackgroundRefresh";

export function Proposals({ initialProjectId }: { initialProjectId?: string } = {}) {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [overviewLoading, setOverviewLoading] = useState(true); const [overviewError, setOverviewError] = useState(""); const [overviewAttempt, setOverviewAttempt] = useState(0);
	const [projectId, setProjectId] = useState(initialProjectId ?? "");
	const [result, setResult] = useState<{ projectId: string; value: ProjectPullRequests; page: number }>();
	const [pages, setPages] = useState<{ projectId: string; cursors: (string | undefined)[]; index: number }>({ projectId: "", cursors: [undefined], index: 0 });
	const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
	const [selected, setSelected] = useState<number>();
	const [linkError, setLinkError] = useState(""); const [opening, setOpening] = useState<number>();
	const pending = useRef(false); const linkPending = useRef(false); const overviewPending = useRef(true);
	const project = workspace.projects.find(value => value.id === projectId && !value.worktree?.removedAt);
	const page = pages.projectId === project?.id ? pages.index : 0;
	const cursor = pages.projectId === project?.id ? pages.cursors[page] : undefined;
	useEffect(() => {
		if (!api) { overviewPending.current = false; setOverviewLoading(false); setOverviewError("Open the desktop application to load projects."); return; }
		let active = true, changed = false; overviewPending.current = true; setOverviewLoading(true); setOverviewError("");
		void api.overview().then(value => { if (active && !changed) setWorkspace(value); }, reason => { if (active && !changed) setOverviewError(message(reason)); }).finally(() => { if (active) { overviewPending.current = false; setOverviewLoading(false); } });
		const unsubscribe = api.onOverviewChange(value => { changed = true; setWorkspace(value); }); return () => { active = false; unsubscribe(); };
	}, [api, overviewAttempt]);
	useEffect(() => {
		if (!api || !project) { pending.current = false; setLoading(false); return; }
		let active = true; pending.current = true; setLoading(true); setError("");
		void api.pullRequests(project.id, cursor).then(value => { if (active) setResult({ projectId: project.id, value, page }); }, reason => { if (active) setError(message(reason)); }).finally(() => { if (active) { pending.current = false; setLoading(false); } });
		return () => { active = false; };
	}, [api, project?.id, cursor, page, attempt]);
	function refresh() { if (!api) return; if (overviewError) { if (!overviewPending.current) { overviewPending.current = true; setOverviewLoading(true); setOverviewAttempt(value => value + 1); } return; } if (!project || pending.current) return; pending.current = true; setLoading(true); setAttempt(value => value + 1); }
	function goToPage(index: number, nextCursor?: string) { if (!project || pending.current || linkPending.current) return; pending.current = true; setLoading(true); setLinkError(""); setPages(current => { const cursors = current.projectId === project.id ? current.cursors.slice(0, index + 1) : [undefined]; if (nextCursor !== undefined) cursors[index] = nextCursor; return { projectId: project.id, cursors, index }; }); setAttempt(value => value + 1); }
	async function open(request: PullRequest) {
		if (!api || linkPending.current) return; linkPending.current = true; setOpening(request.number); setLinkError("");
		try { await api.openLink(request.url); } catch (reason) { setLinkError(message(reason)); } finally { linkPending.current = false; setOpening(undefined); }
	}
	const visible = result && project && result.projectId === project.id ? result.value : undefined;
	useBackgroundRefresh(() => { if (selected === undefined && !linkPending.current) refresh(); });
	return <div className="page proposals-page"><h1>Pull requests</h1>
		<section className="panel" aria-label="Pull requests" aria-busy={loading || overviewLoading}>
			{selected === undefined && <div className="panel-heading"><h2>Open pull requests</h2></div>}
			<div className="proposal-project"><label>Project<Select label="Pull-request project" disabled={overviewLoading || opening !== undefined} value={projectId} onValueChange={value => { setSelected(undefined); setProjectId(value); setPages({ projectId: value, cursors: [undefined], index: 0 }); setError(""); setLinkError(""); }} options={[{ value: "", label: "Choose a project" }, ...workspace.projects.filter(value => !value.worktree?.removedAt).map(value => ({ value: value.id, label: value.name }))]} /></label>{visible && <p>{visible.repository} · Updated {new Date(visible.fetchedAt).toLocaleTimeString()}</p>}</div>
			{overviewLoading && <p className="proposal-feedback" role="status">Loading projects…</p>}
			{overviewError && <p className="proposal-feedback proposal-error" role="alert">{overviewError}</p>}
			{!project && !overviewLoading && !overviewError && <p className="proposal-feedback">Choose a GitHub project to view its open pull requests.</p>}
			{loading && <p className="proposal-feedback" role="status">Loading pull requests…</p>}
			{error && <p className="proposal-feedback proposal-error" role="alert">{error}</p>}
			{linkError && <p className="proposal-feedback proposal-error" role="alert">{linkError}</p>}
			{selected !== undefined && project && <PullRequestDetail key={project.id + ":" + selected} projectId={project.id} number={selected} opening={opening !== undefined} onOpen={request => void open(request)} onBack={() => { const number = selected; setSelected(undefined); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.proposal-row[data-number="${number}"] .proposal-open`)?.focus()); }} />}
			{selected === undefined && visible?.requests.map(request => <article className="proposal-row" data-number={request.number} key={request.number}><div><button type="button" className="proposal-open" onClick={() => { setLinkError(""); setSelected(request.number); }}>#{request.number} {request.title}</button><small>{request.author} · {request.head} → {request.base}</small><div className="proposal-statuses">{request.draft && <span className="status-pill">Draft</span>}<span>{reviewLabels[request.review]}</span><span>{checkLabels[request.checks]}</span></div></div><button type="button" disabled={opening !== undefined} onClick={() => void open(request)}>{opening === request.number ? "Opening…" : "Open on GitHub"}</button></article>)}
			{selected === undefined && visible && !loading && !error && !visible.requests.length && <p className="proposal-feedback">No open pull requests.</p>}
			{selected === undefined && visible && result && <nav className="proposal-pagination" aria-label="Pull-request pages"><span>Page {result.page + 1} · {visible.requests.length} {visible.requests.length === 1 ? "pull request" : "pull requests"}</span>{page > 0 && <button type="button" disabled={loading || opening !== undefined} onClick={() => goToPage(0)}>First page</button>}<button type="button" disabled={loading || opening !== undefined || result.page === 0} onClick={() => goToPage(result.page - 1)}>Previous</button><button type="button" disabled={loading || opening !== undefined || !visible.nextCursor} onClick={() => goToPage(result.page + 1, visible.nextCursor)}>Next</button></nav>}
		</section>
	</div>;
}
function message(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
