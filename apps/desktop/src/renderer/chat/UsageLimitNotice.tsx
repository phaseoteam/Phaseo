import { useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { resetLabel } from "../../shared/usageLimitRecovery";
import { errorText, useWorkspace } from "../app/workspace";
import { showToast } from "../components/ui/toast";

/**
 * T3's usage-limit recovery under a limited chat: when the plan limit resets, Resume when the limit resets (scheduled
 * a minute after the reset the account's limits give) and Continue now.
 */
export function UsageLimitNotice({ task }: { task: Task }) {
	const { command } = useWorkspace();
	const [busy, setBusy] = useState(false);
	const limit = task.usageLimit;
	if (task.status !== "limited" || !limit) return null;
	const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
	const button = (label: string, onClick: () => void, disabled = false) => <button type="button" disabled={busy || disabled} onClick={onClick} className="font-medium text-foreground hover:underline disabled:text-muted-foreground disabled:no-underline">{label}</button>;
	return <section aria-label="Usage limit" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
		<Gauge className="size-4 shrink-0 text-warning" />
		<span className="text-foreground/85">{limit.resetsAt ? `Usage limit reached. It resets at ${resetLabel(limit.resetsAt)}.` : "Usage limit reached. The reset time is not known yet."}</span>
		{limit.resumeAt
			? <><span>Resumes at {resetLabel(limit.resumeAt)}.</span><span aria-hidden>·</span>{button("Cancel", () => void run(() => command({ type: "resume-at-reset", id: task.id, cancel: true })))}</>
			: <>{button("Resume when the limit resets", () => void run(() => command({ type: "resume-at-reset", id: task.id })))}</>}
		<span aria-hidden>·</span>{button("Continue now", () => void run(() => command({ type: "resume", id: task.id })))}
	</section>;
}

/** After a restart, T3 offers to continue the chats the app's quit interrupted; this asks once per start. */
export function QuitRecoveryOffer() {
	const { api, command, select } = useWorkspace();
	const asked = useRef(false);
	useEffect(() => {
		if (!api || asked.current) return;
		asked.current = true;
		void api.quitInterrupted().then(ids => {
			if (!ids.length) return;
			const one = ids.length === 1;
			showToast("info", one ? "A chat stopped when Phaseo quit" : `${ids.length} chats stopped when Phaseo quit`, one ? "Continue it where it left off?" : "Continue them where they left off?", {
				label: one ? "Continue" : "Continue all",
				onClick: () => { void Promise.allSettled(ids.map(id => command({ type: "resume", id }))).then(results => { if (results.some(result => result.status === "rejected")) showToast("error", "Some chats could not continue", "Open them and press Resume."); }); if (one) select(ids[0]); },
			});
		}, reason => showToast("error", "Could not check for interrupted chats", errorText(reason)));
	}, [api, command, select]);
	return null;
}
