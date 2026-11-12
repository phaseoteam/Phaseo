import { useEffect, useState } from "react";
import { Download, FileText, ImageOff, LoaderCircle, TextQuote } from "lucide-react";
import type { Attachment } from "../../shared/workspace";
import { ImageViewer } from "../components/ImageViewer";
import { showToast } from "../components/ui/toast";
import { formatBytes } from "../lib/filePreview";
import { cn } from "../lib/utils";

/** What a message sends when it carries only attachments; the chat shows the attachments without it. */
export const attachmentsOnlyText = "Please review the attached files.";

export type AttachmentShape = "image" | "video" | "audio" | "pasted-text" | "file";
/** How a sent attachment is drawn: media on its own above the bubble, a long paste as a pasted-text card, the rest as file cards. */
export function attachmentShape(attachment: Pick<Attachment, "kind" | "name" | "mimeType">): AttachmentShape {
	if (attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio") return attachment.kind;
	return attachment.kind === "text" && attachment.mimeType === "text/plain" && /^pasted-text(?: \(\d+\))?\.txt$/.test(attachment.name) ? "pasted-text" : "file";
}

/** "PDF · 1.2 MB · 3 pages", "MD · 4.0 KB", or the size alone for a paste. */
export function attachmentDetail(attachment: Pick<Attachment, "kind" | "name" | "mimeType" | "size" | "pages">) {
	const parts = [formatBytes(attachment.size)];
	if (attachmentShape(attachment) !== "pasted-text") parts.unshift(attachment.mimeType === "application/pdf" ? "PDF" : /\.([a-z0-9]{1,8})$/i.exec(attachment.name)?.[1]?.toUpperCase() ?? "File");
	if (attachment.pages) parts.push(`${attachment.pages} ${attachment.pages === 1 ? "page" : "pages"}`);
	return parts.join(" · ");
}

// Media data comes over IPC as data URLs; a few recent ones are kept so scrolling back does not read them again.
const cache = new Map<string, Promise<string | undefined>>();
const cacheLimit = 24;
function attachmentUrl(taskId: string, id: string) {
	const key = `${taskId}:${id}`;
	let entry = cache.get(key);
	if (entry) { cache.delete(key); cache.set(key, entry); return entry; }
	const api = window.phaseoDesktop?.workspace;
	entry = api ? api.attachment(taskId, id).then(value => value.dataUrl, () => { cache.delete(key); return undefined; }) : Promise.resolve(undefined);
	cache.set(key, entry);
	while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
	return entry;
}

/** A sent attachment's data URL: undefined while loading, null when it cannot be read. */
export function useAttachmentUrl(taskId: string | undefined, id: string) {
	const [url, setUrl] = useState<string | null>();
	useEffect(() => {
		if (!taskId) return;
		let active = true; setUrl(undefined);
		void attachmentUrl(taskId, id).then(value => { if (active) setUrl(value ?? null); });
		return () => { active = false; };
	}, [taskId, id]);
	return url;
}

async function saveAttachment(taskId: string, attachment: Attachment) {
	try { if (await window.phaseoDesktop?.workspace.saveAttachment(taskId, attachment.id)) showToast("success", `Saved ${attachment.name}`); }
	catch (reason) { showToast("error", "Could not save the attachment", reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : String(reason)); }
}

function MediaState({ failed, label, className }: { failed: boolean; label: string; className?: string }) {
	return <span role={failed ? "img" : "status"} aria-label={failed ? `${label} could not be loaded` : `Loading ${label}`} className={cn("grid place-items-center rounded-md bg-muted text-muted-foreground", className)}>
		{failed ? <ImageOff className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
	</span>;
}

function ImageThumbnail({ taskId, attachment, single, onOpen, onLoad }: { taskId: string; attachment: Attachment; single: boolean; onOpen: () => void; onLoad: (url: string) => void }) {
	const url = useAttachmentUrl(taskId, attachment.id);
	useEffect(() => { if (url) onLoad(url); }, [url]);
	const size = single ? "h-48 min-w-24 max-w-full" : "size-24";
	if (!url) return <MediaState failed={url === null} label={attachment.name} className={size} />;
	return <button type="button" onClick={onOpen} aria-label={`Open ${attachment.name}`} title={attachment.name} className="overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
		<img src={url} alt={attachment.name} draggable={false} className={cn("block bg-muted", single ? "h-48 w-auto max-w-full object-contain" : "size-24 object-cover")} />
	</button>;
}

function VideoAttachment({ taskId, attachment }: { taskId: string; attachment: Attachment }) {
	const url = useAttachmentUrl(taskId, attachment.id);
	if (!url) return <MediaState failed={url === null} label={attachment.name} className="aspect-video h-48" />;
	return <video src={url} controls preload="metadata" aria-label={attachment.name} title={attachment.name} className="h-48 max-w-full rounded-md bg-black" />;
}

function AudioAttachment({ taskId, attachment }: { taskId: string; attachment: Attachment }) {
	const url = useAttachmentUrl(taskId, attachment.id);
	return <div className="flex w-80 max-w-full flex-col gap-1 rounded-md bg-muted px-3 py-2">
		<span className="truncate text-xs font-medium text-foreground/85" title={attachment.name}>{attachment.name}</span>
		{url ? <audio src={url} controls preload="metadata" aria-label={attachment.name} className="h-8 w-full" /> : <span className="text-xs text-muted-foreground">{url === null ? "This recording could not be loaded." : "Loading…"}</span>}
	</div>;
}

function FileCard({ taskId, attachment, onPreview }: { taskId: string; attachment: Attachment; onPreview: (id: string) => void }) {
	const pasted = attachmentShape(attachment) === "pasted-text", label = pasted ? "Pasted text" : attachment.name;
	return <div className="flex w-64 max-w-full items-center gap-1 rounded-md bg-muted py-1.5 pr-1 pl-1.5">
		<button type="button" aria-label={`Preview ${label}`} title={attachment.name} onClick={() => onPreview(attachment.id)} className="group/file flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
			<span className="grid size-9 shrink-0 place-items-center rounded-md bg-background/70 text-muted-foreground">{pasted ? <TextQuote className="size-4" /> : <FileText className="size-4" />}</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13px] font-medium group-hover/file:underline">{label}</span>
				<span className="block text-xs text-muted-foreground tabular-nums">{attachmentDetail(attachment)}</span>
			</span>
		</button>
		<button type="button" aria-label={`Download ${label}`} title={`Download ${label}`} onClick={() => void saveAttachment(taskId, attachment)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><Download className="size-3.5" /></button>
	</div>;
}

/**
 * A sent message's attachments in their own shapes: images and videos above the bubble (a lone image at a fixed
 * height, several as a strip of squares that open as a gallery), audio as a player, and files and pastes as cards.
 */
export function MessageAttachments({ taskId, attachments, onPreview }: { taskId: string; attachments: Attachment[]; onPreview: (id: string) => void }) {
	const [viewing, setViewing] = useState<number>();
	const [urls, setUrls] = useState<Record<string, string>>({});
	const images = attachments.filter(attachment => attachmentShape(attachment) === "image");
	const videos = attachments.filter(attachment => attachmentShape(attachment) === "video");
	const audio = attachments.filter(attachment => attachmentShape(attachment) === "audio");
	const files = attachments.filter(attachment => ["file", "pasted-text"].includes(attachmentShape(attachment)));
	const gallery = images.flatMap(image => urls[image.id] ? [{ src: urls[image.id], alt: image.name }] : []);
	if (!attachments.length) return null;
	return <div className="flex max-w-[85%] flex-col items-end gap-1.5">
		{(images.length > 0 || videos.length > 0) && <div className="flex flex-wrap justify-end gap-1.5">
			{images.map(image => <ImageThumbnail key={image.id} taskId={taskId} attachment={image} single={images.length === 1 && !videos.length}
				onLoad={url => setUrls(current => current[image.id] === url ? current : { ...current, [image.id]: url })}
				onOpen={() => setViewing(Math.max(0, gallery.findIndex(entry => entry.src === urls[image.id])))} />)}
			{videos.map(video => <VideoAttachment key={video.id} taskId={taskId} attachment={video} />)}
		</div>}
		{audio.map(item => <AudioAttachment key={item.id} taskId={taskId} attachment={item} />)}
		{files.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{files.map(file => <FileCard key={file.id} taskId={taskId} attachment={file} onPreview={onPreview} />)}</div>}
		{viewing !== undefined && gallery.length > 0 && <ImageViewer images={gallery} index={viewing} onClose={() => setViewing(undefined)} />}
	</div>;
}
