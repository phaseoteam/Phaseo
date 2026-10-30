"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PanelLeft, Copy, Download } from "lucide-react";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { ocrText, rankedDocuments, rerankDocuments } from "@/lib/chat/documentTools";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { RoomSdkExport } from "@/components/(chat)/RoomSdkExport";
import { RoomWorkingIndicator } from "@/components/(chat)/RoomWorkingIndicator";
import { RoomErrorNotice } from "./RoomErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/components/ui/sidebar";

export function DocumentToolsRoom({ room, models }: { room: "ocr" | "rerank"; models: GatewaySupportedModel[] }) {
	const t = useTranslations("Product.chatRooms");
	const locale = useLocale();
	const { toggleSidebar } = useSidebar();
	const available = useMemo(() => filterModelsForRoom(models, room).filter((model) => model.isAvailable), [models, room]);
	const [selected, setSelected] = useState("");
	const modelId = available.some((model) => model.modelId === selected) ? selected : available[0]?.modelId ?? "";
	const [imageUrl, setImageUrl] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [documents, setDocuments] = useState("");
	const [topN, setTopN] = useState(5);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<{ raw: unknown; documents: string[]; model: string } | null>(null);
	const controller = useRef<AbortController | null>(null);
	useEffect(() => () => controller.current?.abort(), []);
	const text = result ? ocrText(result.raw) : "";
	const ranked = result ? rankedDocuments(result.raw, result.documents) : [];
	const isOcr = room === "ocr";
	const title = isOcr ? "OCR" : t("newMainCopy.rerank");
	const inputDocuments = rerankDocuments(documents);
	const ready = Boolean(modelId && (isOcr ? file || imageUrl.trim() : query.trim() && inputDocuments.length && Number.isInteger(topN) && topN > 0));

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready || controller.current) return;
		const requestController = new AbortController();
		controller.current = requestController;
		setPending(true);
		setError(null);
		setResult(null);
		try {
			let image = imageUrl.trim();
			if (isOcr && file) {
				if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(t("newMainCopy.imageFormat"));
				if (file.size > 10 * 1024 * 1024) throw new Error(t("newMainCopy.imageSize"));
				image = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result));
					reader.onerror = () => reject(new Error(t("newMainCopy.imageReadFailed")));
					reader.readAsDataURL(file);
				});
			}
			requestController.signal.throwIfAborted();
			const response = await fetchChatWebApi(`/api/chat/${room}`, {
				method: "POST", signal: requestController.signal,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ requestBody: isOcr ? { model: modelId, image } : {
					model: modelId, query: query.trim(), documents: inputDocuments, top_n: Math.min(topN, inputDocuments.length), return_documents: true,
				} }),
			});
			if (!response.ok) throw new Error(await response.text() || t("newMainCopy.requestStatusFailed", {status: response.status}));
			const raw: unknown = await response.json();
			if (!requestController.signal.aborted) setResult({ raw, documents: inputDocuments, model: modelId });
		} catch (cause) {
			if (!requestController.signal.aborted) setError(cause instanceof Error ? cause.message : t("newMainCopy.requestFailed"));
		} finally {
			controller.current = null;
			setPending(false);
		}
	}

	function download() {
		const url = URL.createObjectURL(new Blob([JSON.stringify(result?.raw, null, 2)], { type: "application/json" }));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `${room}-result.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
		<header className="flex min-h-[57px] shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 md:px-6">
			<Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={t("newMainCopy.toggleSidebar")}><PanelLeft className="size-4" /></Button>
			<h1 className="text-sm font-medium">{title}</h1>
			<RoomModelSelector models={available} selectedModelIds={modelId ? [modelId] : []} onSelectModel={setSelected} />
			<div className="ml-auto flex items-center">
				<RoomSdkExport />
			</div>
		</header>
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
			<div className="mx-auto grid w-full max-w-3xl gap-6">
				<p className="text-sm text-muted-foreground">{isOcr ? t("newMainCopy.ocrDescription") : t("newMainCopy.rerankDescription")}</p>
				{!available.length && <p role="status" className="rounded-md border border-border p-4 text-sm">{t("newMainCopy.unavailable", {title})}</p>}
				<form onSubmit={submit} className="grid gap-4">
					<fieldset disabled={pending} className="grid min-w-0 gap-4">
						{isOcr ? <>
							<label className="grid gap-2 text-sm" htmlFor="ocr-url">{t("newMainCopy.imageURL")}<Input id="ocr-url" type="url" placeholder="https://example.com/image.png" value={imageUrl} disabled={Boolean(file)} onChange={(event) => setImageUrl(event.target.value)} /></label>
							<label className="grid gap-2 text-sm" htmlFor="ocr-file">{t("newMainCopy.upload")}<Input ref={fileInput} id="ocr-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="text-xs text-muted-foreground">{t("newMainCopy.formatsHelp")}</span></label>
							{file && <Button type="button" variant="outline" className="justify-self-start" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>{t("newMainCopy.removeImage")}</Button>}
						</> : <>
							<label className="grid gap-2 text-sm" htmlFor="rerank-query">{t("newMainCopy.query")}<Input id="rerank-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("newMainCopy.queryPlaceholder")} required /></label>
							<label className="grid gap-2 text-sm" htmlFor="rerank-documents">{t("newMainCopy.documents")}<Textarea id="rerank-documents" rows={7} value={documents} onChange={(event) => setDocuments(event.target.value)} placeholder={t("newMainCopy.documentsPlaceholder")} required /><span className="text-xs text-muted-foreground">{t("newMainCopy.documentsHelp", {count: inputDocuments.length})}</span></label>
							<label className="grid max-w-40 gap-2 text-sm" htmlFor="rerank-count">{t("newMainCopy.results")}<Input id="rerank-count" type="number" min={1} step={1} value={topN} onChange={(event) => setTopN(Number(event.target.value))} required /></label>
						</>}
					</fieldset>
					{error && <RoomErrorNotice error={error} />}
					<Button type="submit" className="justify-self-end" disabled={pending || !ready}>{pending ? <RoomWorkingIndicator label={isOcr ? t("newMainCopy.extracting") : t("newMainCopy.ranking")} /> : isOcr ? t("newMainCopy.extract") : t("newMainCopy.rank")}</Button>
				</form>
				{result && <section aria-label={t("newMainCopy.results")} aria-live="polite" className="min-w-0 space-y-4 border-t border-border pt-5">
					<div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-sm font-medium">{t("newMainCopy.results")}</h2>
						{isOcr && text && <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(text).catch(() => setError(t("newMainCopy.copyTextFailed"))); }}><Copy className="size-4" />{t("newMainCopy.copyText")}</Button>}
						<Button variant="outline" size="sm" onClick={download}><Download className="size-4" />{t("newMainCopy.downloadJson")}</Button>
					</div>
					<p className="break-all text-xs text-muted-foreground">{result.model}</p>
					{isOcr ? <pre className="whitespace-pre-wrap break-words rounded-md border border-border p-4 font-sans text-sm">{text || t("newMainCopy.noText")}</pre> : ranked.length ? <ol className="space-y-3">{ranked.map((item, position) => <li key={`${item.index}-${position}`} className="rounded-md border border-border p-4"><div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{t("newMainCopy.documentRank", {rank: position + 1, index: item.index + 1})}</span><span>{item.score === null ? t("newMainCopy.scoreUnavailable") : t("newMainCopy.score", {score: item.score.toLocaleString(locale, {minimumFractionDigits: 4, maximumFractionDigits: 4})})}</span></div><p className="whitespace-pre-wrap break-words text-sm">{item.text}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">{t("newMainCopy.noRanked")}</p>}
					<details><summary className="cursor-pointer text-sm text-muted-foreground">{t("newMainCopy.fullResponse")}</summary><pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(result.raw, null, 2)}</pre></details>
				</section>}
			</div>
		</div>
	</main>;
}
