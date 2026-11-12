import { useEffect, useState, useSyncExternalStore } from "react";
import { History, LoaderCircle } from "lucide-react";
import type { NativeSession } from "../../shared/sessionImport";
import { resetLabel } from "../../shared/usageLimitRecovery";
import { errorText, useWorkspace } from "../app/workspace";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { showToast } from "../components/ui/toast";
import { SettingsButton } from "../settings/SettingsLayout";
import { harnessNames } from "../chat/ModelPicker";

let importOpen = false;
const listeners = new Set<() => void>();
export function openImportSessions(value = true) { importOpen = value; for (const listener of listeners) listener(); }
const useImportOpen = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => importOpen);
const key = (session: Pick<NativeSession, "harness" | "sessionId">) => `${session.harness}:${session.sessionId}`;
const folderName = (cwd?: string) => cwd?.split(/[\\/]/).filter(Boolean).at(-1);

/**
 * Past Claude Code and Codex conversations from this computer, imported as chats that continue them: each resumes its
 * own session in its folder (added as a project when needed), so the agent keeps its context.
 */
export function ImportSessionsDialog() {
	const open = useImportOpen();
	const { api, setOverview } = useWorkspace();
	const [sessions, setSessions] = useState<NativeSession[]>();
	const [chosen, setChosen] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!open || !api) return;
		let active = true;
		setSessions(undefined); setChosen(new Set()); setError("");
		void api.nativeSessions().then(value => { if (active) setSessions(value); }, reason => { if (active) setError(errorText(reason)); });
		return () => { active = false; };
	}, [open, api]);
	const close = () => { if (!busy) openImportSessions(false); };
	const available = sessions?.filter(session => !session.imported) ?? [];
	const toggle = (session: NativeSession) => setChosen(current => { const next = new Set(current); if (!next.delete(key(session))) next.add(key(session)); return next; });
	const run = async () => {
		if (!api || !chosen.size) return;
		setBusy(true); setError("");
		try {
			const result = await api.importNativeSessions(available.filter(session => chosen.has(key(session))).map(session => ({ harness: session.harness, sessionId: session.sessionId })));
			setOverview(result.workspace);
			if (result.imported) showToast("success", result.imported === 1 ? "Imported 1 conversation" : `Imported ${result.imported} conversations`, "They are in your chats. Send a message in one to continue it.");
			if (result.failed.length) setError(result.failed.join("\n")); else openImportSessions(false);
		} catch (reason) { setError(errorText(reason)); }
		finally { setBusy(false); }
	};
	const allChosen = available.length > 0 && chosen.size === available.length;
	return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
		<DialogContent className="sm:max-w-xl">
			<DialogHeader>
				<DialogTitle>Import past conversations</DialogTitle>
				<DialogDescription>Claude Code and Codex conversations from the last 30 days on this computer. Each becomes a chat that continues the same session, showing its last 200 messages.</DialogDescription>
			</DialogHeader>
			{!sessions && !error && <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Looking for conversations…</p>}
			{sessions && !sessions.length && <p className="text-sm text-muted-foreground">No Claude Code or Codex conversations from the last 30 days were found.</p>}
			{sessions && sessions.length > 0 && <ScrollArea className="max-h-[50vh]"><ul className="flex flex-col">
				{sessions.map(session => <li key={key(session)}>
					<label className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted has-[:disabled]:opacity-60">
						<Checkbox className="mt-0.5" checked={session.imported || chosen.has(key(session))} disabled={busy || session.imported} onCheckedChange={() => toggle(session)} aria-label={`Import ${session.title}`} />
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">{session.title}</span>
							<span className="block truncate text-xs text-muted-foreground">{harnessNames[session.harness]}{folderName(session.cwd) ? ` · ${folderName(session.cwd)}` : ""} · {resetLabel(session.updatedAt)}{session.imported ? " · already a chat" : ""}</span>
						</span>
					</label>
				</li>)}
			</ul></ScrollArea>}
			{error && <p role="alert" className="text-xs whitespace-pre-line text-destructive">{error}</p>}
			<DialogFooter>
				{available.length > 0 && <SettingsButton variant="ghost" disabled={busy} onClick={() => setChosen(allChosen ? new Set() : new Set(available.map(key)))}>{allChosen ? "Clear" : "Select all"}</SettingsButton>}
				<SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton>
				<SettingsButton variant="primary" disabled={busy || !chosen.size} onClick={() => void run()}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <History className="size-3.5" />}{chosen.size ? `Import ${chosen.size}` : "Import"}</SettingsButton>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
}
