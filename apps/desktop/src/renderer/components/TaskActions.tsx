import { useTextCopy } from "./useTextCopy";
import { Menu } from "@base-ui/react/menu";
import { Archive, ArrowRightLeft, Check, Copy, Download, Ellipsis, GitFork, Minimize2, Pin } from "lucide-react";
import type { Task } from "../../shared/workspace";

export function TaskActions({ task, busy, onArchive, onPin, onFork, onHandoff, onExport, onCompact }: {
	task: Pick<Task, "id" | "archived" | "pinned" | "status" | "harness" | "nativeSessionId">;
	busy: boolean;
	onArchive: () => void;
	onPin: () => void;
	onFork: () => void;
	onHandoff: () => void;
	onExport: (format: "markdown" | "json") => void;
	onCompact: () => void;
}) {
	const { status, copying, copy } = useTextCopy(task.id);
	const active = task.status === "running" || task.status === "waiting";
	return <Menu.Root>
		<Menu.Trigger aria-label="Chat actions" title="Chat actions"><Ellipsis size={16} /></Menu.Trigger>
		<Menu.Portal>
			<Menu.Positioner className="task-actions-positioner" align="end" sideOffset={8}>
				<Menu.Popup className="task-actions-menu" aria-label="Chat actions">
					<Menu.Item onClick={onPin}><Pin size={16} />{task.pinned ? "Unpin chat" : "Pin chat"}</Menu.Item>
					<Menu.Item disabled={active || busy} onClick={onFork}><GitFork size={16} />Fork chat history</Menu.Item>
					<Menu.Item disabled={active || busy} onClick={onHandoff}><ArrowRightLeft size={16} />Handoff</Menu.Item>
					<Menu.Item closeOnClick={false} disabled={copying} onClick={() => void copy()}>{status === "copied" ? <Check size={16} /> : <Copy size={16} />}<span aria-live="polite">{status === "copied" ? "Chat ID copied" : status === "failed" ? "Retry copying chat ID" : "Copy chat ID"}</span></Menu.Item>
					{["opencode", "codex", "claude", "pi"].includes(task.harness) && task.nativeSessionId && <Menu.Item disabled={active || busy || task.archived} onClick={onCompact}><Minimize2 size={16} />Compact context</Menu.Item>}
					<Menu.Separator />
					<Menu.Item disabled={busy} onClick={() => onExport("markdown")}><Download size={16} />Export Markdown</Menu.Item>
					<Menu.Item disabled={busy} onClick={() => onExport("json")}><Download size={16} />Export JSON with files</Menu.Item>
					<Menu.Separator />
					<Menu.Item disabled={active || busy} onClick={onArchive}><Archive size={16} />{task.archived ? "Restore chat" : "Archive chat"}</Menu.Item>
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	</Menu.Root>;
}
