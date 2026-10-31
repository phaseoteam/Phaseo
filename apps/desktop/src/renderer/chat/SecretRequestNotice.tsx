import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import type { Task } from "../../shared/workspace";
import type { SecretRequest } from "../../shared/secretRequests";
import { errorText, useWorkspace } from "../app/workspace";

/**
 * T3's secret request card, restyled: the agent's label and reason, a masked field and Save or Don't share. The value
 * goes straight to the vault and is never kept here or shown in the chat.
 */
export function SecretRequestNotice({ task }: { task: Task }) {
	const pending = task.secretRequests?.filter(request => request.status === "pending") ?? [];
	if (!pending.length) return null;
	return <>{pending.map(request => <SecretRequestForm key={request.id} taskId={task.id} request={request} />)}</>;
}

function SecretRequestForm({ taskId, request }: { taskId: string; request: SecretRequest }) {
	const { api, setOverview } = useWorkspace();
	const [value, setValue] = useState("");
	const [shown, setShown] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const answer = async (secret: string | null) => {
		if (!api || busy) return;
		setBusy(true); setError("");
		try { setOverview(await api.answerSecret(taskId, request.id, secret)); setValue(""); }
		catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	return <form aria-label={`Secret request: ${request.label}`} className="flex flex-col gap-1.5 text-[13px]" onSubmit={event => { event.preventDefault(); if (value) void answer(value); }}>
		<p className="flex items-center gap-2 font-medium text-foreground/85"><KeyRound className="size-4 text-muted-foreground" />The agent asks for {request.label}</p>
		<p className="ml-6 text-xs whitespace-pre-wrap text-muted-foreground">{request.reason}</p>
		<div className="ml-6 flex items-center gap-1.5">
			<div className="relative min-w-0 flex-1">
				<input autoFocus type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} aria-label={request.label} placeholder={request.placeholder ?? "Paste the secret"} value={value} onChange={event => setValue(event.target.value)} disabled={busy}
					className="h-8 w-full rounded-md border border-input bg-transparent py-1 pr-8 pl-2.5 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-ring" />
				<button type="button" aria-label={shown ? "Hide the secret" : "Show the secret"} onClick={() => setShown(current => !current)} className="absolute top-1 right-1 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">{shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
			</div>
			<button type="submit" disabled={busy || !value} className="h-8 shrink-0 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50">Save</button>
			<button type="button" disabled={busy} onClick={() => void answer(null)} className="h-8 shrink-0 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">Don't share</button>
		</div>
		<p className="ml-6 text-[11.5px] text-muted-foreground">{request.delivery === "file" ? "It is kept in Phaseo's secure storage and given to the agent as a private file for 24 hours; it never appears in the chat." : "It is kept in Phaseo's secure storage; the agent gets a reference for its commands for 24 hours and never sees the value."}</p>
		{error && <p role="alert" className="ml-6 text-xs text-destructive">{error}</p>}
	</form>;
}
