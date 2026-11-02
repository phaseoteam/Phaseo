"use client";

import { useId, useState } from "react";
import { Check, Copy, MailCheck, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { discardReplyDraft, sendReplyDraft, updateReplyDraft } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatCostNanos } from "@/lib/work/format";
import type { CustomerRequest, ReplyDraft } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { TimeAgo } from "./WorkBits";

/** Who a draft goes to: the address the API gives, else the request's contact email. */
export function draftRecipient(draft: ReplyDraft, request: CustomerRequest | undefined): string | null {
	return draft.contactEmail?.trim() || request?.contactEmail?.trim() || null;
}

/** Reply drafts written by the support agent. Nothing is sent until a person confirms it here. */
export function ReplyDraftsSection({ drafts, requests, showItemLink = false }: { drafts: ReplyDraft[]; requests: CustomerRequest[]; showItemLink?: boolean }) {
	const t = useTranslations("Work.replies");
	const open = drafts.filter((draft) => draft.status === "draft");
	if (!open.length) return null;
	return (
		<section aria-labelledby="work-reply-drafts" className="space-y-2">
			<h2 id="work-reply-drafts" className="flex items-center gap-1.5 text-sm font-medium"><MailCheck className="size-4 text-muted-foreground" aria-hidden="true" />{t("title")}</h2>
			<Callout tone="info">{t("reviewNote")}</Callout>
			<ul className="space-y-3">
				{open.map((draft) => <ReplyDraftEditor key={draft.id} draft={draft} request={requests.find((request) => request.id === draft.requestId)} showItemLink={showItemLink} />)}
			</ul>
		</section>
	);
}

export function ReplyDraftEditor({ draft, request, showItemLink = false }: { draft: ReplyDraft; request: CustomerRequest | undefined; showItemLink?: boolean }) {
	const t = useTranslations("Work.replies");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [subject, setSubject] = useState(draft.subject);
	const [body, setBody] = useState(draft.body);
	const [confirming, setConfirming] = useState(false);
	const [copied, setCopied] = useState(false);
	const recipient = draftRecipient(draft, request);
	const dirty = subject !== draft.subject || body !== draft.body;
	const disabled = busy !== null;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(subject.trim() ? `${subject.trim()}\n\n${body}` : body);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
			return true;
		} catch {
			return false;
		}
	};

	const save = () => perform("save", () => updateReplyDraft(draft.id, { subject: subject.trim(), body }));

	const send = async () => {
		if (dirty) {
			const saved = await save();
			if (!saved.ok) return;
		}
		if (!recipient) return;
		const result = await perform("send", () => sendReplyDraft(draft.id, recipient));
		setConfirming(false);
		if (!result.ok) return;
		if (result.delivery === "email") {
			toast.success(t("sentTo", { email: recipient }));
			return;
		}
		// No email sender for customers yet: the draft is marked sent and the person sends it themselves.
		const ok = await copy();
		const mailto = typeof result.mailto === "string" && result.mailto.startsWith("mailto:") ? result.mailto : null;
		toast.success(ok ? t("markedSentCopied") : t("markedSent"), mailto ? { action: { label: t("openEmail"), onClick: () => { window.location.href = mailto; } }, duration: 15_000 } : undefined);
	};

	return (
		<li className="space-y-2 rounded-md border p-3">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span>{recipient ? t("to", { email: recipient }) : t("noRecipient")}</span>
				{request?.customerName ? <span>· {request.customerName}</span> : null}
				{showItemLink && draft.workItemNumber ? <Link href={`/work/${draft.workItemNumber}`} className="text-foreground hover:underline">· #{draft.workItemNumber}</Link> : null}
				<span>· <TimeAgo value={draft.createdAt} /></span>
				{draft.model ? <span className="font-mono">· {draft.model} · {formatCostNanos(draft.costNanos)}</span> : null}
			</div>
			<div className="space-y-1.5">
				<Label htmlFor={`${id}-subject`} className="sr-only">{t("subject")}</Label>
				<Input id={`${id}-subject`} value={subject} maxLength={300} placeholder={t("subject")} onChange={(event) => setSubject(event.target.value)} className="h-8 rounded-md text-sm" />
				<Label htmlFor={`${id}-body`} className="sr-only">{t("body")}</Label>
				<Textarea id={`${id}-body`} value={body} rows={6} maxLength={20000} onChange={(event) => setBody(event.target.value)} className="rounded-md text-sm" />
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" size="sm" disabled={disabled || !recipient || !body.trim()} onClick={() => setConfirming(true)}><Send aria-hidden="true" />{t("send")}</Button>
				{dirty ? <Button type="button" size="sm" variant="outline" disabled={disabled || !body.trim()} onClick={save}>{tCommon("save")}</Button> : null}
				<Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? tCommon("copied") : tCommon("copy")}</Button>
				<Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => perform("discard", () => discardReplyDraft(draft.id))}><Trash2 aria-hidden="true" />{t("discard")}</Button>
			</div>
			<Dialog open={confirming} onOpenChange={setConfirming}>
				<DialogContent className="rounded-md sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("confirmTitle")}</DialogTitle>
						<DialogDescription>{t("confirmDescription", { email: recipient ?? "" })}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setConfirming(false)}>{tCommon("cancel")}</Button>
						<Button type="button" disabled={disabled || !recipient} onClick={send}><Send aria-hidden="true" />{t("confirmSend", { email: recipient ?? "" })}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	);
}
