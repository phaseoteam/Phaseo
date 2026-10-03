import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Attachment } from "../../shared/workspace";

export function AttachmentPreview({ taskId, id, onClose }: { taskId: string; id: string; onClose: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [content, setContent] = useState<{ attachment: Attachment; text?: string; dataUrl?: string }>();
	const [error, setError] = useState("");
	useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace; if (!api) return;
		let active = true; setContent(undefined); setError("");
		void api.attachment(taskId, id).then(value => { if (active) setContent(value); }, reason => { if (active) setError(String(reason)); });
		return () => { active = false; };
	}, [taskId, id]);
	return <dialog className="attachment-preview" ref={dialog} aria-label="Attachment preview" onCancel={onClose}>
		<header><strong>{content?.attachment.name ?? "Attachment"}</strong><button type="button" aria-label="Close attachment preview" onClick={onClose}><X size={18} /></button></header>
		{error ? <p className="task-error" role="alert">{error}</p> : !content ? <p role="status">Loading attachment…</p> : content.dataUrl ? <img src={content.dataUrl} alt={content.attachment.name} /> : <pre>{content.text}</pre>}
	</dialog>;
}
