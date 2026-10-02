"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, AudioLines, Braces, CheckCircle2, ChevronDown, CircleDot, FileAudio, FlaskConical, ImageIcon, MessageSquareText, Play, Search, ShieldCheck, Sparkles, Square, Video, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { buildPlaygroundRequest, isExpectedParameterRejection, PARAMETER_PROBES, summarizeErrorPayload, type ParameterProbe, type PlaygroundEndpoint, type PlaygroundTransport } from "@/lib/internal/modelTestPlayground";

type Modality = "text" | "image" | "video" | "speech" | "transcription" | "music" | "embeddings" | "moderation" | "realtime";
type EndpointId = PlaygroundEndpoint | "images" | "video" | "speech" | "transcription" | "translation" | "music" | "embeddings" | "moderation" | "realtime";
type Definition = { id: Modality; icon: typeof MessageSquareText; capabilities: string[]; endpoints: EndpointId[]; prompt: string; parameters?: boolean; audioUrl?: boolean };

// Keep these sample prompts in English so test requests stay comparable across locales.
const DEFINITIONS: Definition[] = [
	{ id: "text", icon: MessageSquareText, capabilities: ["text.generate", "responses", "chat.completions"], endpoints: ["responses", "chat_completions", "messages"], prompt: "Reply with exactly: provider test successful", parameters: true },
	{ id: "image", icon: ImageIcon, capabilities: ["image.generate", "images.generate", "images.generations"], endpoints: ["images"], prompt: "A small cobalt circle on a plain white background" },
	{ id: "video", icon: Video, capabilities: ["video.generate", "video.generation", "video.generations"], endpoints: ["video"], prompt: "A paper airplane gliding across a plain studio background" },
	{ id: "speech", icon: AudioLines, capabilities: ["audio.speech", "audio.generate"], endpoints: ["speech"], prompt: "Provider test successful." },
	{ id: "transcription", icon: FileAudio, capabilities: ["audio.transcribe", "audio.transcription", "audio.translate", "audio.translation"], endpoints: ["transcription", "translation"], prompt: "", audioUrl: true },
	{ id: "music", icon: AudioLines, capabilities: ["music.generate", "music.generation", "audio.music"], endpoints: ["music"], prompt: "A short calm electronic ident with no vocals." },
	{ id: "embeddings", icon: Braces, capabilities: ["embeddings", "text.embeddings", "embedding"], endpoints: ["embeddings"], prompt: "A deterministic embedding test sentence." },
	{ id: "moderation", icon: ShieldCheck, capabilities: ["moderations", "moderation"], endpoints: ["moderation"], prompt: "This is a harmless test sentence." },
	{ id: "realtime", icon: CircleDot, capabilities: ["audio.realtime", "realtime"], endpoints: ["realtime"], prompt: "Return a short greeting." },
];

type Plan = { id: string; modelId: string; providerId: string; probe: ParameterProbe | null; iteration: number };
type StatusKey = "queued" | "running" | "passed" | "failed" | "cancelled";
type FailureLayerKey = "typescriptSdk" | "authenticationOrPolicy" | "gatewayValidation" | "routing" | "providerRateLimit" | "providerUpstream" | "gatewayOrUpstream" | "unexpectedResponse" | "browserOrProxy";
type Result = Plan & { parameter: string; expect: "accept" | "reject"; status: StatusKey; httpStatus: number | null; durationMs: number | null; requestId: string | null; routedProvider: string | null; failureLayer: FailureLayerKey | null; error: string | null; request: unknown; body: unknown };
const BASE_URL = "https://api.phaseo.app/v1";
const APP_ATTRIBUTION = { "x-app-id": "phaseo-app", "x-app-name": "Phaseo", "x-title": "Phaseo", "http-referer": "https://phaseo.app" };

function supports(model: GatewaySupportedModel, definition: Definition) {
	const actual = model.capabilities.map((value) => value.trim().toLowerCase());
	return definition.capabilities.some((expected) => actual.some((value) => value === expected || value.includes(expected)));
}
function parseJson(value: string) { const parsed = value.trim() ? JSON.parse(value) : {}; if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Custom parameters must be a JSON object."); return parsed as Record<string, unknown>; }
function failureLayer(status: number, payload: unknown, transport: PlaygroundTransport): FailureLayerKey { const text = JSON.stringify(payload ?? "").toLowerCase(); if (transport === "typescript_sdk" && text.includes("sdk_request_failed")) return "typescriptSdk"; if ([401, 403].includes(status)) return "authenticationOrPolicy"; if ([400, 422].includes(status)) return "gatewayValidation"; if (status === 404 || text.includes("no provider") || text.includes("candidate")) return "routing"; if (status === 429) return "providerRateLimit"; if (status >= 500 && text.includes("provider")) return "providerUpstream"; if (status >= 500) return "gatewayOrUpstream"; return "unexpectedResponse"; }

function requestFor(args: { modality: Modality; endpoint: EndpointId; modelId: string; providerId: string; prompt: string; audioUrl: string; probe: ParameterProbe | null; custom: Record<string, unknown> }) {
	const provider = { only: [args.providerId], allow_fallbacks: false };
	if (args.modality === "text") return buildPlaygroundRequest({ endpoint: args.endpoint as PlaygroundEndpoint, model: args.modelId, prompt: args.prompt, providerId: args.providerId, probe: args.probe, customParameters: args.custom });
	const common = { ...args.custom, model: args.modelId, provider, stream: false };
	if (args.modality === "image" || args.modality === "video") return { ...common, prompt: args.prompt };
	if (args.modality === "speech") return { ...common, input: args.prompt, voice: "alloy", response_format: "mp3" };
	if (args.modality === "transcription") return { ...common, audio_url: args.audioUrl };
	if (args.modality === "music") return { ...common, prompt: args.prompt };
	if (args.modality === "embeddings" || args.modality === "moderation") return { ...common, input: args.prompt };
	return common;
}
function directPath(endpoint: EndpointId): `/api/chat/${string}` { if (endpoint === "responses") return "/api/chat/text"; if (endpoint === "chat_completions") return "/api/chat/chat-completions"; if (endpoint === "messages") return "/api/chat/messages"; if (endpoint === "images") return "/api/chat/image"; if (endpoint === "video") return "/api/chat/video"; if (endpoint === "embeddings") return "/api/chat/embeddings"; if (endpoint === "moderation") return "/api/chat/moderation"; return "/api/chat/audio"; }
function Status({ result }: { result: Result }) { const t = useTranslations("Product.internalTools.modelTestPlayground"); if (result.status === "passed") return <Badge className="bg-emerald-600 text-white"><CheckCircle2 className="mr-1 h-3 w-3" />{t("status.expected")}</Badge>; if (result.status === "failed") return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />{t("status.mismatch")}</Badge>; return <Badge variant="secondary">{t(`status.${result.status}` as never)}</Badge>; }

export default function ModelTestPlaygroundClient({ models }: { models: GatewaySupportedModel[] }) {
	const t = useTranslations("Product.internalTools.modelTestPlayground");
	const [modality, setModality] = useState<Modality>("text"); const definition = DEFINITIONS.find((item) => item.id === modality) ?? DEFINITIONS[0];
	const eligible = useMemo(() => models.filter((model) => model.isAvailable && supports(model, definition)), [definition, models]);
	const modelIds = useMemo(() => Array.from(new Set(eligible.map((model) => model.selectorModelId))).sort(), [eligible]);
	const [selectedModels, setSelectedModels] = useState<string[]>([]); const activeModels = selectedModels.filter((id) => modelIds.includes(id));
	const providers = useMemo(() => Array.from(new Map(eligible.filter((model) => !activeModels.length || activeModels.includes(model.selectorModelId)).map((model) => [model.providerId, model.providerName ?? model.providerId])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [activeModels, eligible]);
	const [selectedProviders, setSelectedProviders] = useState<string[]>([]); const activeProviders = selectedProviders.filter((id) => providers.some(([provider]) => provider === id));
	const [endpoint, setEndpoint] = useState<EndpointId>("responses"); const [transport, setTransport] = useState<PlaygroundTransport>("direct");
	const [prompt, setPrompt] = useState(definition.prompt); const [audioUrl, setAudioUrl] = useState(""); const [customJson, setCustomJson] = useState("{}");
	const [probeIds, setProbeIds] = useState(PARAMETER_PROBES.filter((probe) => probe.expect === "accept").map((probe) => probe.id));
	const [iterations, setIterations] = useState("1"); const [concurrency, setConcurrency] = useState("4"); const [modelQuery, setModelQuery] = useState(""); const [providerQuery, setProviderQuery] = useState("");
	const [results, setResults] = useState<Result[]>([]); const [error, setError] = useState<string | null>(null); const [running, setRunning] = useState(false); const controller = useRef<AbortController | null>(null);

	const changeRoom = (next: Modality) => { const nextDefinition = DEFINITIONS.find((item) => item.id === next) ?? DEFINITIONS[0]; setModality(next); setEndpoint(nextDefinition.endpoints[0]); setPrompt(nextDefinition.prompt); setSelectedModels([]); setSelectedProviders([]); setResults([]); setError(null); };
	const plan = () => { const output: Plan[] = []; const chosenModels = activeModels.length ? activeModels : modelIds.slice(0, 1); const repeat = Math.min(Math.max(Number.parseInt(iterations, 10) || 1, 1), 10); const probes = definition.parameters ? PARAMETER_PROBES.filter((probe) => probeIds.includes(probe.id)) : []; for (const modelId of chosenModels) { const available = eligible.filter((model) => model.selectorModelId === modelId).map((model) => model.providerId); const chosenProviders = activeProviders.length ? activeProviders.filter((id) => available.includes(id)) : available; for (const providerId of chosenProviders) for (let iteration = 1; iteration <= repeat; iteration += 1) { output.push({ id: `${modelId}:${providerId}:baseline:${iteration}`, modelId, providerId, probe: null, iteration }); for (const probe of probes) output.push({ id: `${modelId}:${providerId}:${probe.id}:${iteration}`, modelId, providerId, probe, iteration }); } } return output; };

	const execute = async (item: Plan, custom: Record<string, unknown>, signal: AbortSignal) => {
		const request = requestFor({ modality, endpoint, modelId: item.modelId, providerId: item.providerId, prompt, audioUrl, probe: item.probe, custom }); const started = performance.now();
		setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: "running", request } : result));
		try {
			let path = transport === "typescript_sdk" ? "/api/chat/sdk-test" as const : directPath(endpoint); let envelope: Record<string, unknown> = { baseUrl: BASE_URL, requestBody: request, endpoint, debug: true, appHeaders: APP_ATTRIBUTION };
			if (modality === "transcription" && transport === "direct") envelope = { ...envelope, action: endpoint }; if (modality === "speech" && transport === "direct") envelope = { ...envelope, action: "speech" }; if (modality === "music" && transport === "direct") envelope = { ...envelope, action: "music" };
			if (modality === "realtime") { path = "/api/chat/realtime/session"; envelope = { provider: item.providerId, model: item.modelId, voice: "alloy", instructions: prompt, appHeaders: APP_ATTRIBUTION }; }
			const response = await fetchChatWebApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope), signal }); const contentType = response.headers.get("content-type") ?? ""; let payload: unknown;
			if (contentType.includes("json") || contentType.startsWith("text/")) { const raw = await response.text(); try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; } } else { const blob = await response.blob(); payload = { contentType, bytes: blob.size }; }
			const expect = item.probe?.expect ?? "accept"; const matched = expect === "accept" ? response.ok : isExpectedParameterRejection(response.status); const message = response.ok ? (expect === "reject" ? t("errors.expectedRejectionButAccepted") : null) : summarizeErrorPayload(payload, `${response.status} ${response.statusText}`);
			setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: matched ? "passed" : "failed", httpStatus: response.status, durationMs: performance.now() - started, requestId: response.headers.get("x-request-id") ?? response.headers.get("cf-ray"), routedProvider: response.headers.get("x-phaseo-provider") ?? response.headers.get("x-provider"), failureLayer: response.ok ? null : failureLayer(response.status, payload, transport), error: message, body: { payload, headers: Object.fromEntries(response.headers.entries()) } } : result));
		} catch (caught) { setResults((current) => current.map((result) => result.id === item.id ? { ...result, status: signal.aborted ? "cancelled" : "failed", durationMs: performance.now() - started, failureLayer: signal.aborted ? null : "browserOrProxy", error: signal.aborted ? t("errors.runCancelled") : caught instanceof Error ? caught.message : t("errors.requestFailed") } : result)); }
	};

	const run = async () => {
		setError(null);
		let custom: Record<string, unknown>;
		try {
			custom = parseJson(customJson);
		} catch {
			setError(t("errors.customParametersJson"));
			return;
		}
		if (definition.audioUrl && !audioUrl.trim()) {
			setError(t("errors.audioUrlRequired"));
			return;
		}
		if (modality === "realtime" && transport === "typescript_sdk") {
			setError(t("errors.realtimeDirectApi"));
			return;
		}
		const items = plan();
		if (!items.length) {
			setError(t("errors.noCompatibleRoutes"));
			return;
		}
		const abort = new AbortController();
		controller.current = abort;
		setRunning(true);
		setResults(items.map((item) => ({ ...item, parameter: item.probe?.label ?? t("baseline"), expect: item.probe?.expect ?? "accept", status: "queued", httpStatus: null, durationMs: null, requestId: null, routedProvider: null, failureLayer: null, error: null, request: null, body: null })));
		let cursor = 0;
		const worker = async () => {
			while (cursor < items.length && !abort.signal.aborted) await execute(items[cursor++], custom, abort.signal);
		};
		await Promise.all(Array.from({ length: Math.min(Math.max(Number.parseInt(concurrency, 10) || 1, 1), 12, items.length) }, worker));
		setRunning(false);
		controller.current = null;
	};
	const passed = results.filter((result) => result.status === "passed").length; const failed = results.filter((result) => result.status === "failed").length; const filteredModels = modelIds.filter((id) => id.toLowerCase().includes(modelQuery.toLowerCase())); const filteredProviders = providers.filter(([id, name]) => `${id} ${name}`.toLowerCase().includes(providerQuery.toLowerCase()));
	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
			<header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
				<div className="flex items-center gap-3">
					<div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><FlaskConical className="h-5 w-5" /></div>
					<div><h1 className="font-semibold">{t("title")}</h1><p className="text-xs text-muted-foreground">{t("subtitle")}</p></div>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="ghost" size="sm"><Link href="/internal">{t("internalTools")}</Link></Button>
					{running ? <Button variant="destructive" size="sm" onClick={() => controller.current?.abort()}><Square className="mr-2 h-3.5 w-3.5" />{t("stop")}</Button> : <Button size="sm" onClick={() => void run()}><Play className="mr-2 h-3.5 w-3.5" />{t("runMatrix")}</Button>}
				</div>
			</header>
			<nav className="flex gap-1 overflow-x-auto border-b bg-muted/20 px-4 py-2 lg:px-6">
				{DEFINITIONS.map((item) => { const Icon = item.icon; return <Button key={item.id} size="sm" variant={modality === item.id ? "default" : "ghost"} onClick={() => changeRoom(item.id)}><Icon className="mr-1.5 h-3.5 w-3.5" />{t(("modalities." + item.id) as never)}</Button>; })}
			</nav>
			<div className="grid min-h-0 flex-1 xl:grid-cols-[340px_minmax(0,1fr)]">
				<aside className="space-y-5 border-r p-4">
					<section className="space-y-2"><Label>{t("transport")}</Label><div className="grid grid-cols-2 gap-2"><Button size="sm" variant={transport === "direct" ? "default" : "outline"} onClick={() => setTransport("direct")}>{t("directApi")}</Button><Button size="sm" disabled={modality === "realtime"} variant={transport === "typescript_sdk" ? "default" : "outline"} onClick={() => setTransport("typescript_sdk")}>TypeScript SDK</Button></div></section>
					<section className="space-y-2"><Label>{t("endpointStyle")}</Label><div className="grid grid-cols-2 gap-2">{definition.endpoints.map((id) => <Button key={id} size="sm" variant={endpoint === id ? "default" : "outline"} onClick={() => setEndpoint(id)}>{t(("endpoints." + id) as never)}</Button>)}</div></section>
					<section className="space-y-2"><Label htmlFor="test-input">{definition.audioUrl ? t("instructions") : t("testInput")}</Label><Textarea id="test-input" className="min-h-24" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></section>
					{definition.audioUrl ? <section className="space-y-2"><Label htmlFor="audio-url">{t("publicAudioUrl")}</Label><Input id="audio-url" placeholder="https://…/sample.mp3" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} /></section> : null}
					<div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-xs font-medium">{t("iterations")}<Input type="number" min="1" max="10" value={iterations} onChange={(event) => setIterations(event.target.value)} /></label><label className="space-y-2 text-xs font-medium">{t("concurrency")}<Input type="number" min="1" max="12" value={concurrency} onChange={(event) => setConcurrency(event.target.value)} /></label></div>
					<section className="space-y-2"><Label htmlFor="custom-json">{t("customRequestFields")}</Label><Textarea id="custom-json" className="min-h-28 font-mono text-xs" value={customJson} onChange={(event) => setCustomJson(event.target.value)} spellCheck={false} /></section>
				</aside>
				<main className="min-w-0 space-y-5 p-4 lg:p-6">
					<div className="grid gap-4 lg:grid-cols-2">
						<Picker title={t("models")} description={activeModels.length ? t("selectedCount", { count: activeModels.length }) : t("firstCompatibleModel")} query={modelQuery} onQuery={setModelQuery} items={filteredModels.map((id) => [id, id] as [string, string])} selected={activeModels} onSelected={setSelectedModels} />
						<Picker title={t("providers")} description={activeProviders.length ? t("selectedCount", { count: activeProviders.length }) : t("allCompatibleProviders")} query={providerQuery} onQuery={setProviderQuery} items={filteredProviders} selected={activeProviders} onSelected={setSelectedProviders} />
					</div>
					{definition.parameters ? <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{t("quickTestPacks")}</CardTitle><CardDescription>{t("quickTestPacksDescription")}</CardDescription></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setProbeIds(PARAMETER_PROBES.filter((probe) => probe.expect === "accept").map((probe) => probe.id))}>{t("valid")}</Button><Button size="sm" variant="outline" onClick={() => setProbeIds(PARAMETER_PROBES.map((probe) => probe.id))}><Sparkles className="mr-1 h-3.5 w-3.5" />{t("boundsAndInvalid")}</Button><Button size="sm" variant="ghost" onClick={() => setProbeIds([])}>{t("smokeOnly")}</Button></div></div></CardHeader><CardContent className="flex flex-wrap gap-2">{PARAMETER_PROBES.map((probe) => <button key={probe.id} onClick={() => setProbeIds((current) => current.includes(probe.id) ? current.filter((id) => id !== probe.id) : [...current, probe.id])} className={`rounded-full border px-3 py-1.5 text-xs ${probeIds.includes(probe.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{probe.label} · {t(("expectation." + probe.expect) as never)}</button>)}</CardContent></Card> : null}
					{error ? <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div> : null}
					<Results results={results} passed={passed} failed={failed} />
				</main>
			</div>
		</div>
	);

}

function Picker({ title, description, query, onQuery, items, selected, onSelected }: { title: string; description: string; query: string; onQuery: (value: string) => void; items: Array<[string, string]>; selected: string[]; onSelected: (value: string[]) => void }) {
	const t = useTranslations("Product.internalTools.modelTestPlayground");
	return (
		<Card>
			<CardHeader className="pb-3"><div className="flex items-start justify-between"><div><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></div><div><Button size="sm" variant="ghost" onClick={() => onSelected(items.map(([id]) => id))}>{t("all")}</Button><Button size="sm" variant="ghost" onClick={() => onSelected([])}>{t("clear")}</Button></div></div></CardHeader>
			<CardContent className="space-y-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("filterPlaceholder", { title })} /></div><div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">{items.map(([id, label]) => <button key={id} className={`rounded-md border px-3 py-2 text-left text-xs ${selected.includes(id) ? "border-primary bg-primary/8" : "hover:bg-muted/50"}`} onClick={() => onSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])}><span className="block truncate font-medium">{label}</span><span className="block truncate font-mono text-[10px] text-muted-foreground">{id}</span></button>)}</div></CardContent>
		</Card>
	);
}

function Results({ results, passed, failed }: { results: Result[]; passed: number; failed: number }) {
	const t = useTranslations("Product.internalTools.modelTestPlayground");
	return (
		<Card>
			<CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{t("statusMatrix")}</CardTitle><CardDescription>{t("statusDescription")}</CardDescription></div>{results.length ? <div className="flex gap-2"><Badge className="bg-emerald-600 text-white">{t("expectedCount", { count: passed })}</Badge><Badge variant={failed ? "destructive" : "outline"}>{t("mismatchCount", { count: failed })}</Badge><Badge variant="secondary">{t("totalCount", { count: results.length })}</Badge></div> : null}</div></CardHeader>
			<CardContent>{!results.length ? <div className="rounded-xl border border-dashed py-20 text-center text-sm text-muted-foreground">{t("configureAndRun")}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-3 py-3">{t("columns.modelProvider")}</th><th className="px-3 py-3">{t("columns.test")}</th><th className="px-3 py-3">{t("columns.outcome")}</th><th className="px-3 py-3">HTTP</th><th className="px-3 py-3">{t("columns.failureLayer")}</th><th className="px-3 py-3">{t("columns.time")}</th><th className="px-3 py-3">{t("columns.details")}</th></tr></thead><tbody>{results.map((result) => <tr key={result.id} className="border-b align-top last:border-0"><td className="px-3 py-3"><div className="max-w-64 truncate font-mono text-xs">{result.modelId}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{result.providerId}</div></td><td className="px-3 py-3"><div>{result.parameter}</div><div className="text-[10px] uppercase text-muted-foreground">{t("expectationLabel", { expect: t(("expectation." + result.expect) as never) })}</div></td><td className="px-3 py-3"><Status result={result} /></td><td className="px-3 py-3"><span className={`inline-flex min-w-16 justify-center rounded-md border px-3 py-1 font-mono text-lg font-black ${result.httpStatus == null ? "text-muted-foreground" : result.httpStatus >= 400 ? "border-red-500/40 bg-red-500/10 text-red-600" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"}`}>{result.httpStatus ?? "—"}</span></td><td className="px-3 py-3">{result.failureLayer ? <Badge variant="outline">{t(("failureLayers." + result.failureLayer) as never)}</Badge> : "—"}</td><td className="px-3 py-3 font-mono text-xs">{result.durationMs == null ? "—" : `${Math.round(result.durationMs)} ms`}</td><td className="max-w-md px-3 py-3">{result.error ? <p className={`mb-2 text-xs ${result.status === "passed" ? "text-muted-foreground" : "text-destructive"}`}>{result.error}</p> : null}<details><summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground"><ChevronDown className="h-3 w-3" />{t("requestHeadersResponse")}</summary><pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-200">{JSON.stringify({ requestId: result.requestId, routedProvider: result.routedProvider, request: result.request, response: result.body }, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}</CardContent>
		</Card>
	);
}
