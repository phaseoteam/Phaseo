"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { useRouter } from "@/i18n/navigation";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import type { WorkAttachment } from "@/lib/work/types";
import { TimeAgo } from "./WorkBits";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const BASE = "/api/account/work";

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function authHeaders(): Promise<Record<string, string>> {
	const token = await getBrowserAccessToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Files on an item. The browser sends them straight to the account API with the person's own
 * session (like profile photos), so large files don't pass through the web server.
 */
export function WorkAttachments({ number, workspaceId, attachments, available, currentUserId, canManageAll }: { number: number; workspaceId: string; attachments: WorkAttachment[]; available: boolean; currentUserId: string | null; canManageAll: boolean }) {
	const t = useTranslations("Work.attachments");
	const router = useRouter();
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const [busy, setBusy] = useState<string | null>(null);
	const query = `workspaceId=${encodeURIComponent(workspaceId)}`;

	const upload = async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		if (!files.length) return;
		setBusy("upload");
		try {
			for (const file of files) {
				if (file.size > MAX_ATTACHMENT_BYTES) { toast.error(t("tooLarge", { name: file.name })); continue; }
				if (!file.size) { toast.error(t("empty", { name: file.name })); continue; }
				const response = await fetch(`${BASE}/items/${number}/attachments?${query}&name=${encodeURIComponent(file.name)}`, {
					method: "POST",
					body: file,
					headers: { Accept: "application/json", "Content-Type": file.type || "application/octet-stream", ...(await authHeaders()) },
				});
				if (!response.ok) toast.error(response.status === 413 ? t("tooLarge", { name: file.name }) : t("uploadFailed", { name: file.name }));
			}
		} finally {
			setBusy(null);
			router.refresh();
		}
	};

	const download = async (attachment: WorkAttachment) => {
		setBusy(attachment.id);
		try {
			const response = await fetch(`${BASE}/attachments/${attachment.id}/download?${query}`, { headers: await authHeaders() });
			if (!response.ok) { toast.error(t("downloadFailed")); return; }
			const url = URL.createObjectURL(await response.blob());
			const link = document.createElement("a");
			link.href = url;
			link.download = attachment.fileName;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} finally {
			setBusy(null);
		}
	};

	const remove = async (attachment: WorkAttachment) => {
		if (!window.confirm(t("confirmRemove", { name: attachment.fileName }))) return;
		setBusy(attachment.id);
		try {
			const response = await fetch(`${BASE}/attachments/${attachment.id}?${query}`, { method: "DELETE", headers: await authHeaders() });
			if (!response.ok) toast.error(t("removeFailed"));
		} finally {
			setBusy(null);
			router.refresh();
		}
	};

	if (!available && !attachments.length) return null;
	return (
		<section aria-labelledby={`${id}-title`} className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<h2 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-medium"><Paperclip className="size-4" aria-hidden="true" />{t("title")}</h2>
				{available ? (
					<>
						<input ref={input} type="file" multiple className="sr-only" aria-label={t("add")} onChange={upload} />
						<Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>{busy === "upload" ? t("uploading") : t("add")}</Button>
					</>
				) : null}
			</div>
			{available ? null : <Callout tone="info">{t("unavailable")}</Callout>}
			{attachments.length ? (
				<ul className="divide-y rounded-md border text-sm">
					{attachments.map((attachment) => (
						<li key={attachment.id} className="flex items-center gap-3 px-3 py-1.5">
							<button type="button" disabled={busy !== null} onClick={() => void download(attachment)} className="min-w-0 flex-1 truncate text-left hover:underline">{attachment.fileName}</button>
							<span className="text-xs tabular-nums text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
							<TimeAgo value={attachment.createdAt} className="text-xs text-muted-foreground" />
							<Button type="button" variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={t("download", { name: attachment.fileName })} onClick={() => void download(attachment)}><Download aria-hidden="true" /></Button>
							{canManageAll || attachment.uploadedBy === currentUserId ? (
								<Button type="button" variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={t("remove", { name: attachment.fileName })} onClick={() => void remove(attachment)}><Trash2 aria-hidden="true" /></Button>
							) : null}
						</li>
					))}
				</ul>
			) : <p className="text-xs text-muted-foreground">{t("none")}</p>}
		</section>
	);
}
