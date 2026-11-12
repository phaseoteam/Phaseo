import { useEffect, useState } from "react";
import { FileMinus, FilePen, FilePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Checkbox } from "../components/ui/checkbox";
import { SettingsButton } from "../settings/SettingsLayout";
import { errorText, useWorkspace } from "../app/workspace";
import type { CheckpointChange } from "../../shared/gitDiff";
import type { Message, Task } from "../../shared/workspace";

const changeLabels = { added: "Deleted", modified: "Reverted", deleted: "Restored" } as const;
const changeIcons = { added: FileMinus, modified: FilePen, deleted: FilePlus } as const;

/**
 * The "Edit from here" confirmation. In a project the turn's snapshot can also put the files back; the list says
 * what restoring would change now, so nothing is reverted unseen.
 */
export function RewindDialog({ task, message, onClose, onConfirm }: { task: Task; message?: Message; onClose: () => void; onConfirm: (restoreFiles: boolean) => Promise<void> }) {
	const { api } = useWorkspace();
	const snapshot = Boolean(task.projectId && task.mode !== "chat" && message?.checkpoint?.before);
	const [restore, setRestore] = useState(false);
	const [changes, setChanges] = useState<CheckpointChange[] | { error: string }>();
	const [busy, setBusy] = useState(false);
	useEffect(() => { setRestore(false); setChanges(undefined); }, [message?.id]);
	useEffect(() => {
		if (!restore || changes || !api || !message) return;
		let active = true;
		api.checkpointChanges(task.id, message.id).then(value => { if (active) setChanges(value); }, reason => { if (active) setChanges({ error: errorText(reason) }); });
		return () => { active = false; };
	}, [restore, changes, api, task.id, message]);
	const files = Array.isArray(changes) ? changes : [];
	const blocked = restore && (!changes || !Array.isArray(changes));
	const confirm = async () => { setBusy(true); try { await onConfirm(restore && files.length > 0); } finally { setBusy(false); } };
	return <Dialog open={Boolean(message)} onOpenChange={open => { if (!open && !busy) onClose(); }}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Edit from here?</DialogTitle>
				<DialogDescription>This message and everything after it leave the chat, and the message goes back in the composer to edit. You can't undo this; Branch from here keeps the original instead.</DialogDescription>
			</DialogHeader>
			{snapshot && <div className="flex flex-col gap-2">
				<label className="flex items-center gap-2 text-[13px]"><Checkbox checked={restore} onCheckedChange={checked => setRestore(Boolean(checked))} aria-label="Also restore the project's files" />Also restore the project's files to before this turn</label>
				{restore && (!changes ? <p role="status" className="pl-5.5 text-xs text-muted-foreground">Checking what would change…</p>
					: "error" in changes ? <p role="alert" className="pl-5.5 text-xs text-destructive">{changes.error}</p>
					: !files.length ? <p className="pl-5.5 text-xs text-muted-foreground">The files already match this turn's snapshot.</p>
					: <div className="flex flex-col gap-1 pl-5.5">
						<p className="text-xs text-muted-foreground">{files.length === 1 ? "1 file changes" : `${files.length} files change`} in the working tree. Staged changes and commits stay as they are.</p>
						<ul aria-label="Files that change" className="max-h-48 overflow-y-auto font-mono text-[11.5px]">{files.map(change => { const Icon = changeIcons[change.status]; return <li key={change.path} className="flex min-w-0 items-center gap-1.5 py-0.5"><Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate" title={change.path}>{change.path}</span><span className="ml-auto shrink-0 font-sans text-muted-foreground">{changeLabels[change.status]}</span></li>; })}</ul>
					</div>)}
			</div>}
			<DialogFooter>
				<SettingsButton variant="ghost" disabled={busy} onClick={onClose}>Cancel</SettingsButton>
				<SettingsButton variant={restore && files.length ? "danger" : "primary"} disabled={busy || blocked} onClick={() => void confirm()}>{restore && files.length ? "Restore files and edit" : "Edit from here"}</SettingsButton>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
}
