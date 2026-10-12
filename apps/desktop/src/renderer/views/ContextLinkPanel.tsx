import { useEffect, useState } from "react";
import { BrowserPanel } from "./BrowserPanel";
import { PullRequestDetail } from "./PullRequestDetail";

export function ContextLinkPanel({ link, projectId, context, covered }: { link: { url: string; request: number }; projectId?: string; context: string; covered: boolean }) {
	const [review, setReview] = useState<{ projectId: string; number: number }>();
	const [checking, setChecking] = useState(false);
	useEffect(() => {
		let active = true; setReview(undefined);
		const url = new URL(link.url);
		const match = url.hostname === "github.com" ? /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(url.pathname) : null;
		const api = window.phaseoDesktop?.workspace;
		if (!match || !projectId || !api) { setChecking(false); return; }
		setChecking(true);
		void api.pullRequest(projectId, Number(match[3])).then(value => {
			if (active && value.repository.toLowerCase() === `${match[1]}/${match[2]}`.toLowerCase()) setReview({ projectId, number: value.number });
		}).catch(() => { /* Other repositories and issues open in the embedded browser. */ }).finally(() => { if (active) setChecking(false); });
		return () => { active = false; };
	}, [link.url, projectId]);
	if (checking) return <p className="task-muted" role="status">Opening pull request…</p>;
	if (review) return <PullRequestDetail projectId={review.projectId} number={review.number} onBack={() => setReview(undefined)} onOpen={request => { void window.phaseoDesktop?.workspace.openLink(request.url); }} opening={false} />;
	return <BrowserPanel context={context} covered={covered} requestedLink={link} />;
}
