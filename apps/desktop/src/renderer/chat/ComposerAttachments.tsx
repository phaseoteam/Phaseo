import { useContext, useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import type { Mention } from "../lib/mentions";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { ComposerTaskContext } from "./composerEditor";
import { useAttachmentUrl } from "./MessageAttachments";

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name);
/** The draft's images, once each: chat attachments by id and a new chat's pasted files by their local id. */
export const draftImages = (mentions: readonly Mention[]) => mentions.filter((mention, index) => (mention.kind === "image" || (mention.kind === "attachment" && isImageName(mention.label))) && mentions.findIndex(other => other.ref === mention.ref) === index);

function LocalThumbnail({ file, alt }: { file: File; alt: string }) {
	const [url, setUrl] = useState<string>();
	useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
	return url ? <img src={url} alt={alt} className="size-full object-cover" /> : null;
}

function StoredThumbnail({ taskId, id, alt }: { taskId?: string; id: string; alt: string }) {
	const url = useAttachmentUrl(taskId, id);
	return url ? <img src={url} alt={alt} className="size-full object-cover" /> : <ImageIcon aria-hidden className="m-auto size-4 text-muted-foreground" />;
}

/**
 * The images in a draft, as thumbnails above the text. Each image also has its chip in the text, where it says which
 * image is meant; removing a thumbnail removes the image and its chips.
 */
export function ComposerAttachments({ images, files, onRemove }: { images: readonly Mention[]; files?: Record<string, File>; onRemove: (ref: string) => void }) {
	const taskId = useContext(ComposerTaskContext);
	const [preview, setPreview] = useState<string>();
	if (!images.length) return null;
	return <div data-composer-attachments className="mb-3 flex max-w-full flex-wrap gap-2">
		{images.map(image => {
			const file = image.kind === "image" ? files?.[image.ref] : undefined;
			return <div key={image.ref} data-composer-image className="group/attachment relative size-16 shrink-0 overflow-hidden rounded-md border border-border/80 bg-background">
				<button type="button" aria-label={`Preview ${image.label}`} disabled={!taskId || image.kind !== "attachment"} onClick={() => setPreview(image.ref)} className="flex size-full cursor-zoom-in disabled:cursor-default">
					{file ? <LocalThumbnail file={file} alt={image.label} /> : image.kind === "attachment" ? <StoredThumbnail taskId={taskId} id={image.ref} alt={image.label} /> : <ImageIcon aria-hidden className="m-auto size-4 text-muted-foreground" />}
				</button>
				<button type="button" aria-label={`Remove ${image.label}`} onPointerDown={event => event.preventDefault()} onClick={() => onRemove(image.ref)}
					className="absolute top-1 right-1 grid size-5 place-items-center rounded-md bg-background/85 text-foreground opacity-80 shadow-xs transition-opacity hover:opacity-100 group-hover/attachment:opacity-100"><X className="size-3" /></button>
			</div>;
		})}
		{preview && taskId && <AttachmentPreview taskId={taskId} id={preview} onClose={() => setPreview(undefined)} />}
	</div>;
}
