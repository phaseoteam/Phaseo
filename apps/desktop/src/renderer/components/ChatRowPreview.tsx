import type { ReactElement } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { Clock3, FolderOpen, MessageCircle } from "lucide-react";
import type { TaskSummary } from "../../shared/taskHistory";
import { ModelLogo } from "./ModelLogo";

const names = { phaseo: "Phaseo", codex: "Codex", claude: "Claude Code", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok", antigravity: "Antigravity", acp: "ACP agent" };
const statuses = { idle: "Ready", running: "Working", waiting: "Needs input", completed: "Completed", failed: "Failed", interrupted: "Stopped", limited: "Limited" };
export function ChatRowPreview({ task, project, children }: { task: TaskSummary; project: string; children: ReactElement }) {
	const model = task.model ? { id: task.model, name: task.model } : undefined;
	return <PreviewCard.Root><PreviewCard.Trigger render={children} delay={350} /><PreviewCard.Portal><PreviewCard.Positioner side="right" align="start" sideOffset={8} className="chat-preview-positioner"><PreviewCard.Popup className="chat-preview"><strong>{task.title}</strong><div><MessageCircle size={14} /><span>{names[task.harness]}</span></div><div><FolderOpen size={14} /><span>{project}</span></div>{model && <div><ModelLogo model={model} /><span>{model.name}</span></div>}<div><MessageCircle size={14} /><span>{statuses[task.status]}</span></div><div><Clock3 size={14} /><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></div></PreviewCard.Popup></PreviewCard.Positioner></PreviewCard.Portal></PreviewCard.Root>;
}
