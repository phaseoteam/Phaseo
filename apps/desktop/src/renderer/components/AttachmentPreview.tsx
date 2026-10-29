import { useEffect, useRef, useState } from "react";
import { CodeBlock } from "./MessageContent";
import { X } from "lucide-react";
import type { Attachment } from "../../shared/workspace";

export function AttachmentPreview({ taskId, id, onClose }: { taskId: string; id: string; onClose: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [content, setContent] = useState<{ attachment: Attachment; text?: string; dataUrl?: string }>();
	const [attempt, setAttempt] = useState(0);
	const [error, setError] = useState("");
	useEffect(() => {
		const element = dialog.current; const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		element?.showModal();
		return () => { element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
	}, []);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace; if (!api) { setError("Open the desktop application to preview attachments."); return; }
		let active = true; setContent(undefined); setError("");
		void api.attachment(taskId, id).then(value => { if (active) setContent(value); }, reason => { if (active) setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); });
		return () => { active = false; };
	}, [taskId, id, attempt]);
	return <dialog className="attachment-preview" ref={dialog} aria-labelledby="attachment-preview-title" onCancel={event => { event.preventDefault(); onClose(); }}>
		<header><strong id="attachment-preview-title">{content?.attachment.name ?? "Attachment"}</strong><button type="button" aria-label="Close attachment preview" onClick={onClose}><X size={18} /></button></header>
		{error ? <div className="attachment-state"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : !content ? <p className="attachment-state" role="status">Loading attachment…</p> : content.dataUrl ? <img src={content.dataUrl} alt={content.attachment.name} /> : <CodeBlock text={content.text ?? ""} language={content.attachment.mimeType === "application/pdf" ? "" : content.attachment.name.split(".").at(-1)?.toLowerCase()} />}
	</dialog>;
}
