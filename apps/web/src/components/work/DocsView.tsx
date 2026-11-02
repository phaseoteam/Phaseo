"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createWorkDocument, deleteWorkDocument, saveWorkDocument } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WorkDocument, WorkMember, WorkProject } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { AssigneeLabel, TimeAgo } from "./WorkBits";
import { WorkMarkdown } from "./WorkMarkdown";

/** The documents list, newest change first, with a quick "new document". */
export function DocsView({ documents, projects }: { documents: WorkDocument[]; projects: WorkProject[] }) {
	const t = useTranslations("Work.docs");
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<NewDocumentButton />
			</div>
			<DocumentList documents={documents} projects={projects} />
		</div>
	);
}

export function DocumentList({ documents, projects, emptyText }: { documents: WorkDocument[]; projects: WorkProject[]; emptyText?: string }) {
	const t = useTranslations("Work.docs");
	if (!documents.length) return <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyText ?? t("empty")}</p>;
	return (
		<ul className="divide-y rounded-md border">
			{documents.map((document) => (
				<li key={document.id} className="relative flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
					<FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<Link href={`/work/docs/${document.id}`} className="min-w-0 flex-1 truncate after:absolute after:inset-0">{document.title}</Link>
					{document.projectId ? <span className="truncate text-xs text-muted-foreground">{projects.find((project) => project.id === document.projectId)?.name ?? ""}</span> : null}
					<TimeAgo value={document.updatedAt} className="w-24 shrink-0 text-right text-xs text-muted-foreground" />
				</li>
			))}
		</ul>
	);
}

/** Makes an untitled document (optionally in a project) and opens it. */
export function NewDocumentButton({ projectId = null, size = "sm" }: { projectId?: string | null; size?: "sm" | "xs" }) {
	const t = useTranslations("Work.docs");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const create = async () => {
		const result = await perform("doc", () => createWorkDocument({ title: t("untitled"), projectId }), { refresh: false });
		if (result.ok) router.push(`/work/docs/${result.document.id}`);
	};
	return <Button type="button" size={size} variant={size === "xs" ? "outline" : "default"} disabled={busy !== null} onClick={() => void create()}><Plus aria-hidden="true" />{t("new")}</Button>;
}

/** One document: write in Markdown, preview it, and save. A save over someone else's newer version is refused. */
export function DocumentEditor({ document, projects, members }: { document: WorkDocument; projects: WorkProject[]; members: WorkMember[] }) {
	const t = useTranslations("Work.docs");
	const tCommon = useTranslations("Work.common");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [title, setTitle] = useState(document.title);
	const [body, setBody] = useState(document.body ?? "");
	const [projectId, setProjectId] = useState(document.projectId ?? "none");
	const [base, setBase] = useState(document.updatedAt);
	const [mode, setMode] = useState<"write" | "preview">((document.body ?? "").trim() ? "preview" : "write");
	const [conflict, setConflict] = useState(false);
	const dirty = title !== document.title || body !== (document.body ?? "") || projectId !== (document.projectId ?? "none");

	const save = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!title.trim()) return;
		const result = await perform("save", () => saveWorkDocument(document.id, { title: title.trim(), body, projectId: projectId === "none" ? null : projectId, baseUpdatedAt: base }), { refresh: false });
		if (result.ok) { setBase(result.document.updatedAt); setConflict(false); router.refresh(); }
		else if (result.code === "document_changed") setConflict(true);
	};
	const remove = async () => {
		if (!window.confirm(t("deleteConfirm", { title: document.title }))) return;
		const result = await perform("delete", () => deleteWorkDocument(document.id), { refresh: false });
		if (result.ok) { router.push("/work/docs"); router.refresh(); }
	};

	return (
		<form onSubmit={save} className="space-y-4">
			<nav className="flex items-center gap-1 text-xs text-muted-foreground">
				<Link href="/work/docs" className="hover:text-foreground">{t("title")}</Link>
				<ChevronRight className="size-3" aria-hidden="true" />
				<span className="truncate">{document.title}</span>
			</nav>
			{conflict ? <Callout tone="warning" role="alert">{t("conflict")}</Callout> : null}
			<div className="flex flex-wrap items-center gap-3">
				<Label htmlFor={`${id}-title`} className="sr-only">{t("titleLabel")}</Label>
				<Input id={`${id}-title`} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="h-9 min-w-64 flex-1 rounded-md text-lg font-semibold" />
				<Select value={projectId} onValueChange={setProjectId}>
					<SelectTrigger size="sm" aria-label={t("project")} className="w-48 rounded-md"><SelectValue>{projects.find((project) => project.id === projectId)?.name ?? t("noProject")}</SelectValue></SelectTrigger>
					<SelectContent>
						<SelectItem value="none">{t("noProject")}</SelectItem>
						{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
					</SelectContent>
				</Select>
			</div>
			<p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{document.updatedBy ? <>{t("editedBy")} <AssigneeLabel agent={null} userId={document.updatedBy} members={members} compact /></> : null}
				<TimeAgo value={document.updatedAt} />
			</p>
			<div role="tablist" aria-label={t("mode")} className="flex gap-1">
				{(["write", "preview"] as const).map((value) => (
					<button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}
						className={cn("rounded-md px-2.5 py-1 text-sm", mode === value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
						{t(`modes.${value}`)}
					</button>
				))}
			</div>
			{mode === "write" ? (
				<>
					<Label htmlFor={`${id}-body`} className="sr-only">{t("body")}</Label>
					<Textarea id={`${id}-body`} value={body} rows={24} maxLength={200000} placeholder={t("bodyPlaceholder")} onChange={(event) => setBody(event.target.value)} className="rounded-md font-mono text-sm" />
				</>
			) : (
				<div className="min-h-48 rounded-md border px-4 py-3">{body.trim() ? <WorkMarkdown>{body}</WorkMarkdown> : <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>}</div>
			)}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button type="button" variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => void remove()}><Trash2 aria-hidden="true" />{tCommon("delete")}</Button>
				<span className="flex items-center gap-3">
					{dirty ? <span className="text-xs text-muted-foreground">{t("unsaved")}</span> : null}
					<Button type="submit" disabled={busy !== null || !dirty || !title.trim()}>{busy === "save" ? tCommon("saving") : tCommon("save")}</Button>
				</span>
			</div>
		</form>
	);
}
