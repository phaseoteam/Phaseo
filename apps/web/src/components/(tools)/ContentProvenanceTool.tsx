"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import Image from "next/image";
import {
	CheckCircle2,
	ChevronDown,
	FileAudio,
	FileImage,
	Loader2,
	RefreshCw,
	ShieldCheck,
	ShieldQuestion,
	UploadCloud,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

type ProvenanceResult = {
	type: string;
	outcome: string;
	validation_state?: string | null;
	issuer?: string | null;
	model?: string | null;
	generated_at?: string | null;
};

type ProvenanceResponse = {
	object: "content_provenance_check";
	created_at: number;
	results: ProvenanceResult[];
};

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function resultLabel(type: string): string {
	if (type.toLowerCase() === "c2pa") return "C2PA credentials";
	if (type.toLowerCase() === "synthid") return "SynthID watermark";
	return type.replaceAll("_", " ");
}

export default function ContentProvenanceTool() {
	const format = useDisplayFormatters();
	const inputRef = useRef<HTMLInputElement>(null);
	const previewUrlRef = useRef<string | null>(null);
	const requestControllerRef = useRef<AbortController | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [result, setResult] = useState<ProvenanceResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => () => {
		requestControllerRef.current?.abort();
		if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
	}, []);

	const chooseFile = useCallback((nextFile?: File) => {
		requestControllerRef.current?.abort();
		requestControllerRef.current = null;
		setChecking(false);
		setResult(null);
		setError(null);
		if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
		previewUrlRef.current = null;
		setPreviewUrl(null);
		if (!nextFile) {
			setFile(null);
			return;
		}
		if (!nextFile.type.startsWith("image/") && !nextFile.type.startsWith("audio/")) {
			setFile(null);
			setError("Choose an image or audio file.");
			return;
		}
		if (nextFile.size > MAX_FILE_BYTES) {
			setFile(null);
			setError("Choose a file no larger than 20 MB.");
			return;
		}
		setFile(nextFile);
		if (nextFile.type.startsWith("image/")) {
			const nextPreviewUrl = URL.createObjectURL(nextFile);
			previewUrlRef.current = nextPreviewUrl;
			setPreviewUrl(nextPreviewUrl);
		}
	}, []);

	useEffect(() => {
		function handlePaste(event: ClipboardEvent) {
			const pastedImage = Array.from(event.clipboardData?.files ?? [])
				.find((candidate) => candidate.type.startsWith("image/"));
			if (!pastedImage) return;
			event.preventDefault();
			chooseFile(pastedImage);
		}

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [chooseFile]);

	async function checkFile() {
		if (!file || checking) return;
		const controller = new AbortController();
		requestControllerRef.current = controller;
		setChecking(true);
		setError(null);
		setResult(null);
		const body = new FormData();
		body.append("file", file);
		try {
			const response = await fetch("/api/_web/tools/content-provenance", {
				method: "POST",
				headers: { Accept: "application/json" },
				body,
				cache: "no-store",
				signal: controller.signal,
			});
			const payload = await response.json().catch(() => null) as (ProvenanceResponse & { message?: string }) | null;
			if (!response.ok) throw new Error(payload?.message || "Verification failed. Try again.");
			if (!payload || payload.object !== "content_provenance_check" || !Array.isArray(payload.results)) {
				throw new Error("The verification service returned an invalid response.");
			}
			setResult(payload);
		} catch (caught) {
			if (controller.signal.aborted) return;
			setError(caught instanceof Error ? caught.message : "Verification failed. Try again.");
		} finally {
			if (requestControllerRef.current === controller) {
				requestControllerRef.current = null;
				setChecking(false);
			}
		}
	}

	const detected = result?.results.filter((item) => item.outcome === "detected") ?? [];
	const FileIcon = file?.type.startsWith("audio/") ? FileAudio : FileImage;

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6">
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
				<Card className="gap-0 overflow-hidden border-border/80 py-0 shadow-sm">
					<CardHeader className="border-b p-5 sm:px-6">
						<div className="flex items-start gap-3">
							<div className="rounded-xl border bg-background p-2.5 shadow-xs">
								<ShieldCheck className="size-5 text-primary" />
							</div>
							<div>
								<CardTitle>Check a file</CardTitle>
								<CardDescription className="mt-1">Drop, choose, or paste an image—or upload audio. 20 MB maximum.</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-5 p-5 sm:p-6">
						<input
							ref={inputRef}
							type="file"
							accept="image/*,audio/*"
							className="sr-only"
							onClick={(event) => { event.currentTarget.value = ""; }}
							onChange={(event) => chooseFile(event.target.files?.[0])}
						/>
						<div
							onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
							onDragOver={(event) => event.preventDefault()}
							onDragLeave={() => setDragging(false)}
							onDrop={(event) => {
								event.preventDefault();
								setDragging(false);
								chooseFile(event.dataTransfer.files?.[0]);
							}}
							className={cn(
								"group relative flex min-h-52 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
								dragging ? "border-primary bg-primary/5" : "border-border bg-muted/15 hover:border-primary/50 hover:bg-muted/30",
							)}
						>
							{file && previewUrl ? (
								<div className="relative min-h-52 w-full">
									<Image
										src={previewUrl}
										alt={`Preview of ${file.name}`}
										fill
										unoptimized
										sizes="(max-width: 1024px) 100vw, 60vw"
										className="object-contain"
									/>
								</div>
							) : file ? (
								<button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center rounded-xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<span className="mb-4 rounded-2xl border bg-background p-3 shadow-xs"><FileIcon className="size-7 text-primary" /></span>
									<span className="max-w-full truncate font-medium">{file.name}</span>
									<span className="mt-1 text-sm text-muted-foreground">{formatBytes(file.size)} · Click to replace</span>
								</button>
							) : (
								<button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center rounded-xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<span className="mb-4 rounded-2xl border bg-background p-3 shadow-xs transition-transform group-hover:-translate-y-0.5"><UploadCloud className="size-7 text-primary" /></span>
									<span className="font-medium hover:text-primary">Drop, choose, or paste an image</span>
									<span className="mt-1 text-sm text-muted-foreground">Images and audio · Ctrl/Cmd+V · 20 MB maximum</span>
								</button>
							)}
						</div>
						{file && previewUrl ? (
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/15 px-3 py-2.5">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">{file.name}</p>
									<p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
								</div>
								<Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Change image</Button>
							</div>
						) : null}
						{error ? <Alert variant="destructive"><ShieldQuestion className="size-4" /><AlertTitle>Couldn&apos;t check this file</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
						<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs leading-relaxed text-muted-foreground">Your file is sent to OpenAI for this check. Phaseo does not store it.</p>
							<Button onClick={checkFile} disabled={!file || checking} className="sm:min-w-36">
								{checking ? <><Loader2 className="animate-spin" />Checking</> : result ? <><RefreshCw />Check again</> : <><ShieldCheck />Check file</>}
							</Button>
						</div>
					</CardContent>
				</Card>

				<div className="space-y-4">
					<Card className="border-border/80">
						<CardHeader><CardTitle className="text-base">What this checks</CardTitle></CardHeader>
						<CardContent className="space-y-4 text-sm text-muted-foreground">
							<div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><p>Known OpenAI C2PA credentials and SynthID provenance signals.</p></div>
							<div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><p>Images can return C2PA and SynthID results; audio returns SynthID when applicable.</p></div>
						</CardContent>
					</Card>
					<Alert><ShieldQuestion className="size-4" /><AlertTitle>A negative result is not proof</AlertTitle><AlertDescription>Signals can be removed or degraded, and this check does not detect content from other AI providers.</AlertDescription></Alert>
				</div>
			</div>

			{result ? (
				<Card className="border-border/80" aria-live="polite">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div><CardTitle>{detected.length ? "Provenance signal detected" : "No supported signal detected"}</CardTitle><CardDescription className="mt-1">Checked {format.dateTime(result.created_at * 1000)}</CardDescription></div>
							<Badge variant={detected.length ? "default" : "secondary"}>{detected.length ? "Detected" : "Not detected"}</Badge>
						</div>
					</CardHeader>
					<CardContent>
						<div className="grid gap-3 sm:grid-cols-2">
							{result.results.map((item, index) => (
								<div key={`${item.type}-${index}`} className="rounded-xl border bg-muted/15 p-4">
									<div className="flex items-center justify-between gap-3"><p className="font-medium capitalize">{resultLabel(item.type)}</p><Badge variant={item.outcome === "detected" ? "default" : "outline"}>{item.outcome === "detected" ? "Detected" : "Not detected"}</Badge></div>
									{item.model || item.issuer || item.validation_state ? <dl className="mt-4 grid gap-2 text-sm">
										{item.model ? <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Model</dt><dd className="text-right font-medium">{item.model}</dd></div> : null}
										{item.issuer ? <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Issuer</dt><dd className="text-right font-medium">{item.issuer}</dd></div> : null}
										{item.validation_state ? <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Validation</dt><dd className="text-right font-medium capitalize">{item.validation_state.replaceAll("_", " ")}</dd></div> : null}
									</dl> : null}
								</div>
							))}
						</div>
						<details className="group mt-4 overflow-hidden rounded-xl border">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
								<span>View raw response</span>
								<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
							</summary>
							<div className="border-t bg-zinc-950 text-zinc-100">
								<pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-5">
									<code>{JSON.stringify(result, null, 2)}</code>
								</pre>
							</div>
						</details>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
