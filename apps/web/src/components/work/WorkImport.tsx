"use client";

import { useId, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { importWorkItems } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { batchRows, guessMapping, IMPORT_FIELDS, mapRows, parseCsv, type ImportField, type ImportMapping } from "@/lib/work/csv";
import type { WorkProject } from "@/lib/work/types";
import { useWorkErrorMessage } from "./useWorkAction";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Import items from another tracker's CSV export: pick the file, check the columns, import. */
export function WorkImportSection({ projects }: { projects: WorkProject[] }) {
	const t = useTranslations("Work.import");
	const errorMessage = useWorkErrorMessage();
	const router = useRouter();
	const id = useId();
	const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null);
	const [mapping, setMapping] = useState<ImportMapping>({});
	const [projectId, setProjectId] = useState("none");
	const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
	const [outcome, setOutcome] = useState<{ tone: "success" | "critical"; text: string } | null>(null);

	const choose = async (event: ChangeEvent<HTMLInputElement>) => {
		const picked = event.target.files?.[0];
		event.target.value = "";
		setOutcome(null);
		if (!picked) return;
		if (picked.size > MAX_FILE_BYTES) { setOutcome({ tone: "critical", text: t("tooLarge") }); return; }
		const rows = parseCsv(await picked.text());
		if (rows.length < 2) { setOutcome({ tone: "critical", text: t("noRows") }); return; }
		const [header, ...body] = rows;
		setFile({ name: picked.name, header: header!, rows: body });
		setMapping(guessMapping(header!));
	};

	const mapped = file ? mapRows(file.rows, mapping) : [];
	const run = async () => {
		if (!file || !mapped.length) return;
		const batches = batchRows(mapped);
		let created = 0;
		let processed = 0;
		setProgress({ done: 0, total: mapped.length });
		for (const batch of batches) {
			const result = await importWorkItems({ rows: batch, source: file.name, projectId: projectId === "none" ? null : projectId });
			if (!result.ok) { setOutcome({ tone: "critical", text: t("failedPart", { created, error: errorMessage(result) }) }); setProgress(null); router.refresh(); return; }
			created += result.created;
			processed += batch.length;
			setProgress({ done: processed, total: mapped.length });
			if (result.failedAt !== null) { setOutcome({ tone: "critical", text: t("stopped", { created }) }); setProgress(null); router.refresh(); return; }
		}
		setProgress(null);
		setFile(null);
		setOutcome({ tone: "success", text: t("done", { created }) });
		router.refresh();
	};

	const setColumn = (field: ImportField, value: string) => {
		const next = { ...mapping };
		if (value === "none") delete next[field]; else next[field] = Number(value);
		setMapping(next);
	};

	return (
		<section aria-labelledby={`${id}-title`} className="space-y-3">
			<div className="space-y-0.5 border-b pb-2">
				<h3 id={`${id}-title`} className="text-sm font-semibold">{t("title")}</h3>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>
			{outcome ? <Callout tone={outcome.tone} role="status">{outcome.text}</Callout> : null}
			<div className="flex flex-wrap items-center gap-3">
				<Label htmlFor={`${id}-file`} className="sr-only">{t("file")}</Label>
				<input id={`${id}-file`} type="file" accept=".csv,text/csv" onChange={(event) => void choose(event)} disabled={progress !== null} className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2.5 file:py-1 file:text-sm" />
				{file ? <span className="text-xs text-muted-foreground">{t("rowsFound", { count: file.rows.length })}</span> : null}
			</div>
			{file ? (
				<div className="space-y-3">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{IMPORT_FIELDS.map((field) => (
							<div key={field} className="space-y-1">
								<Label className="text-xs">{t(`fields.${field}`)}</Label>
								<Select value={mapping[field] === undefined ? "none" : String(mapping[field])} onValueChange={(value) => setColumn(field, value)}>
									<SelectTrigger size="sm" aria-label={t(`fields.${field}`)} className="w-full rounded-md"><SelectValue>{mapping[field] === undefined ? t("notImported") : file.header[mapping[field]!] || t("column", { number: mapping[field]! + 1 })}</SelectValue></SelectTrigger>
									<SelectContent>
										<SelectItem value="none">{t("notImported")}</SelectItem>
										{file.header.map((name, index) => <SelectItem key={index} value={String(index)}>{name || t("column", { number: index + 1 })}</SelectItem>)}
									</SelectContent>
								</Select>
							</div>
						))}
						<div className="space-y-1">
							<Label className="text-xs">{t("project")}</Label>
							<Select value={projectId} onValueChange={setProjectId}>
								<SelectTrigger size="sm" aria-label={t("project")} className="w-full rounded-md"><SelectValue>{projects.find((project) => project.id === projectId)?.name ?? t("noProject")}</SelectValue></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("noProject")}</SelectItem>
									{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
					</div>
					{mapping.title === undefined ? <Callout tone="warning">{t("needTitle")}</Callout> : null}
					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" disabled={progress !== null || !mapped.length} onClick={() => void run()}>
							{progress ? t("importing", { done: progress.done, total: progress.total }) : t("importCount", { count: mapped.length })}
						</Button>
						<Button type="button" size="sm" variant="ghost" disabled={progress !== null} onClick={() => setFile(null)}>{t("cancel")}</Button>
					</div>
				</div>
			) : null}
		</section>
	);
}
