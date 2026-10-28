import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { attachmentKey } from "../../shared/attachments";
import type { Attachment, WorkItem } from "../../shared/types";

export const attachmentUrl = (item: Pick<WorkItem, "repo" | "number">, file: Pick<Attachment, "name">) => `factory-proof://inputs/${attachmentKey(item)}/${encodeURIComponent(file.name)}`;

/** The images someone attached when they wrote the issue. Agents get the same files. */
export function AttachmentsView({ item }: { item: WorkItem }) {
	const [zoom, setZoom] = useState<Attachment | null>(null);
	const files = item.attachments ?? [];
	if (!files.length) return null;
	return <section className="mb-8">
		<h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><ImageIcon className="size-4 text-muted-foreground" />Images</h2>
		<p className="mb-3 text-xs text-muted-foreground">Handed to every agent that works on this. Factory's own copies, so they load without signing in to GitHub.</p>
		<div className="grid grid-cols-3 gap-3">
			{files.map((file) => <figure key={file.name} className="min-w-0">
				<button type="button" onClick={() => setZoom(file)} className="block w-full overflow-hidden rounded-md border bg-muted hover:border-foreground/30">
					<img src={attachmentUrl(item, file)} alt={file.name} className="aspect-[16/10] w-full object-cover object-top" />
				</button>
				<figcaption className="mt-1 font-mono text-2xs text-muted-foreground">{file.name}</figcaption>
			</figure>)}
		</div>
		{zoom && <button type="button" aria-label="Close" onClick={() => setZoom(null)} className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-10 backdrop-blur-sm">
			<img src={attachmentUrl(item, zoom)} alt={zoom.name} className="max-h-full max-w-full rounded-md border shadow-lg" />
		</button>}
	</section>;
}
