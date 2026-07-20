"use client";

import NumberFlow from "@number-flow/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	AlertTriangle,
	BadgeDollarSign,
	Check,
	ChevronDown,
	ChevronRight,
	Clock3,
	Mic,
	Settings,
	Square,
	Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import type { PersonaState } from "@/components/ai-elements/persona";
import { Logo } from "@/components/Logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { groupModelsByReleaseMonth } from "@/components/(chat)/playgroundConfig";
import { cn } from "@/lib/utils";

const RealtimePersona = dynamic(
	() => import("@/components/ai-elements/persona").then((mod) => mod.Persona),
	{
		ssr: false,
		loading: () => <PersonaLoadingPlaceholder className="h-56 w-56" />,
	},
);

type RealtimeProvider = "openai" | "xai" | "google";
type SessionStatus = "idle" | "connecting" | "connected" | "ended" | "error";

function PersonaLoadingPlaceholder({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center justify-center rounded-full",
				className,
			)}
			aria-hidden="true"
		>
			<div className="h-[62%] w-[62%] rounded-full border border-border/70 bg-muted/30 shadow-inner" />
			<div className="absolute h-[38%] w-[38%] rounded-full bg-background/80" />
		</div>
	);
}

function LightweightRealtimeOrb({
	state,
	className,
}: {
	state: PersonaState;
	className?: string;
}) {
	const isActive = state !== "asleep" && state !== "idle";
	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-sm",
				className,
			)}
			aria-hidden="true"
			data-state={state}
		>
			<span
				className={cn(
					"absolute inset-[12%] rounded-full border transition-all duration-300",
					state === "listening" &&
						"border-sky-400/55 bg-sky-400/10 shadow-[0_0_42px_rgba(56,189,248,0.20)]",
					state === "thinking" &&
						"border-amber-400/55 bg-amber-400/10 shadow-[0_0_42px_rgba(251,191,36,0.18)]",
					state === "speaking" &&
						"border-emerald-400/55 bg-emerald-400/10 shadow-[0_0_42px_rgba(52,211,153,0.20)]",
					!isActive && "border-border bg-muted/30",
				)}
			/>
			<span
				className={cn(
					"absolute inset-[24%] rounded-full border border-border/70 bg-background transition-transform duration-300",
					state === "listening" && "scale-105",
					state === "thinking" && "scale-95",
					state === "speaking" && "scale-110",
				)}
			/>
			<span
				className={cn(
					"absolute h-[30%] w-[30%] rounded-full bg-foreground/80 transition-all duration-300",
					state === "asleep" && "scale-75 opacity-20",
					state === "idle" && "opacity-35",
					state === "listening" && "scale-90 bg-sky-500/80 opacity-80",
					state === "thinking" && "scale-75 bg-amber-500/80 opacity-75",
					state === "speaking" && "scale-125 bg-emerald-500/80 opacity-85",
				)}
			/>
			{isActive ? (
				<span className="absolute inset-[7%] rounded-full border border-foreground/10" />
			) : null}
		</div>
	);
}

type RealtimeVoiceOption = {
	id: string;
	label?: string;
	description?: string;
};

type RealtimeModel = {
	id: string;
	label: string;
	provider: RealtimeProvider;
	providerLabel: string;
	logoId: string;
	model: string;
	releaseDate: string | null;
	defaultVoice: string;
	voices: RealtimeVoiceOption[];
	transport: "WebRTC" | "WebSocket";
	billing:
		| "OpenAI usage events"
		| "xAI duration meter"
		| "Google usage metadata";
};

type RealtimeSessionResponse = {
	id?: string;
	session_id?: string;
	provider: RealtimeProvider;
	model: string;
	voice: string;
	clientSecret: string;
	expiresAt: string | null;
	billing?: {
		reservationNanos: number;
		reservationUsd: number;
		extendThreshold: number;
		gracefulStopThreshold: number;
		maxDurationSeconds: number;
		idleTimeoutSeconds: number;
		authoritative: false;
	};
	connect: {
		transport: "webrtc" | "websocket";
		url: string;
		protocols?: string[];
	};
};

type RealtimeUsage = {
	input_token_details?: {
		text_tokens?: number;
		audio_tokens?: number;
		cached_tokens_details?: {
			text_tokens?: number;
			audio_tokens?: number;
		};
	};
	output_token_details?: {
		text_tokens?: number;
		audio_tokens?: number;
	};
};

type GoogleModalityTokenCount = {
	modality?: string;
	tokenCount?: number;
};

type GoogleUsageMetadata = {
	totalTokenCount?: number;
	promptTokensDetails?: GoogleModalityTokenCount[];
	responseTokensDetails?: GoogleModalityTokenCount[];
};

type TranscriptLine = {
	id: string;
	role: "user" | "assistant" | "system";
	text: string;
	final?: boolean;
};

type RealtimeOrbMode = "simple" | "persona" | "off";

type RealtimeDisplaySettings = {
	orbMode: RealtimeOrbMode;
	systemPrompt?: string;
};

const REALTIME_DISPLAY_SETTINGS_STORAGE_KEY = "ai-stats:chat:realtime:display";
const DEFAULT_REALTIME_DISPLAY_SETTINGS: RealtimeDisplaySettings = {
	orbMode: "simple",
	systemPrompt: "",
};

function isRealtimeOrbMode(value: unknown): value is RealtimeOrbMode {
	return value === "simple" || value === "persona" || value === "off";
}

function readRealtimeDisplaySettings(): RealtimeDisplaySettings {
	if (typeof window === "undefined") return DEFAULT_REALTIME_DISPLAY_SETTINGS;
	try {
		const raw = window.localStorage.getItem(REALTIME_DISPLAY_SETTINGS_STORAGE_KEY);
		if (!raw) return DEFAULT_REALTIME_DISPLAY_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<RealtimeDisplaySettings> & {
			showPersonaOrb?: boolean;
		};
		const systemPrompt =
			typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "";
		if (isRealtimeOrbMode(parsed.orbMode)) {
			return { orbMode: parsed.orbMode, systemPrompt };
		}
		if (parsed.showPersonaOrb === false) {
			return { orbMode: "off", systemPrompt };
		}
		return {
			orbMode: DEFAULT_REALTIME_DISPLAY_SETTINGS.orbMode,
			systemPrompt,
		};
	} catch {
		return DEFAULT_REALTIME_DISPLAY_SETTINGS;
	}
}

const GOOGLE_LIVE_VOICES: RealtimeVoiceOption[] = [
	{ id: "Zephyr", label: "Zephyr", description: "Bright" },
	{ id: "Kore", label: "Kore", description: "Firm" },
	{ id: "Orus", label: "Orus", description: "Firm" },
	{ id: "Autonoe", label: "Autonoe", description: "Bright" },
	{ id: "Umbriel", label: "Umbriel", description: "Easy-going" },
	{ id: "Erinome", label: "Erinome", description: "Clear" },
	{ id: "Laomedeia", label: "Laomedeia", description: "Upbeat" },
	{ id: "Schedar", label: "Schedar", description: "Even" },
	{ id: "Achird", label: "Achird", description: "Friendly" },
	{ id: "Sadachbia", label: "Sadachbia", description: "Lively" },
	{ id: "Puck", label: "Puck", description: "Upbeat" },
	{ id: "Fenrir", label: "Fenrir", description: "Excitable" },
	{ id: "Aoede", label: "Aoede", description: "Breezy" },
	{ id: "Enceladus", label: "Enceladus", description: "Breathy" },
	{ id: "Algieba", label: "Algieba", description: "Smooth" },
	{ id: "Algenib", label: "Algenib", description: "Gravelly" },
	{ id: "Achernar", label: "Achernar", description: "Soft" },
	{ id: "Gacrux", label: "Gacrux", description: "Mature" },
	{ id: "Zubenelgenubi", label: "Zubenelgenubi", description: "Casual" },
	{ id: "Sadaltager", label: "Sadaltager", description: "Knowledgeable" },
	{ id: "Charon", label: "Charon", description: "Informative" },
	{ id: "Leda", label: "Leda", description: "Youthful" },
	{ id: "Callirrhoe", label: "Callirrhoe", description: "Easy-going" },
	{ id: "Iapetus", label: "Iapetus", description: "Clear" },
	{ id: "Despina", label: "Despina", description: "Smooth" },
	{ id: "Rasalgethi", label: "Rasalgethi", description: "Informative" },
	{ id: "Alnilam", label: "Alnilam", description: "Firm" },
	{ id: "Pulcherrima", label: "Pulcherrima", description: "Forward" },
	{ id: "Vindemiatrix", label: "Vindemiatrix", description: "Gentle" },
	{ id: "Sulafat", label: "Sulafat", description: "Warm" },
];

const XAI_GROK_VOICES: RealtimeVoiceOption[] = [
	{ id: "eve", label: "Eve", description: "Energetic, upbeat" },
	{ id: "ara", label: "Ara", description: "Warm, friendly" },
	{ id: "leo", label: "Leo", description: "Authoritative, strong" },
	{ id: "rex", label: "Rex", description: "Confident, clear" },
	{ id: "sal", label: "Sal", description: "Smooth, balanced" },
	{ id: "altair", label: "Altair" },
	{ id: "atlas", label: "Atlas" },
	{ id: "carina", label: "Carina" },
	{ id: "castor", label: "Castor" },
	{ id: "celeste", label: "Celeste" },
	{ id: "cosmo", label: "Cosmo" },
	{ id: "helios", label: "Helios" },
	{ id: "helix", label: "Helix" },
	{ id: "iris", label: "Iris" },
	{ id: "kepler", label: "Kepler" },
	{ id: "lumen", label: "Lumen" },
	{ id: "luna", label: "Luna" },
	{ id: "lux", label: "Lux" },
	{ id: "naksh", label: "Naksh" },
	{ id: "orion", label: "Orion" },
	{ id: "perseus", label: "Perseus" },
	{ id: "rigel", label: "Rigel" },
	{ id: "sirius", label: "Sirius" },
	{ id: "ursa", label: "Ursa" },
	{ id: "zagan", label: "Zagan" },
	{ id: "zenith", label: "Zenith" },
];

const REALTIME_MODELS: RealtimeModel[] = [
	{
		id: "openai:gpt-realtime",
		label: "OpenAI GPT-Realtime",
		provider: "openai",
		providerLabel: "OpenAI",
		logoId: "openai",
		model: "gpt-realtime",
		releaseDate: "2025-08-28T00:00:00",
		defaultVoice: "marin",
		voices: [
			{ id: "marin", label: "Marin" },
			{ id: "cedar", label: "Cedar" },
			{ id: "alloy", label: "Alloy" },
			{ id: "ash", label: "Ash" },
			{ id: "ballad", label: "Ballad" },
			{ id: "coral", label: "Coral" },
			{ id: "echo", label: "Echo" },
			{ id: "sage", label: "Sage" },
			{ id: "shimmer", label: "Shimmer" },
			{ id: "verse", label: "Verse" },
		],
		transport: "WebSocket",
		billing: "OpenAI usage events",
	},
	{
		id: "openai:gpt-realtime-1.5",
		label: "OpenAI GPT-Realtime-1.5",
		provider: "openai",
		providerLabel: "OpenAI",
		logoId: "openai",
		model: "gpt-realtime-1.5",
		releaseDate: "2026-02-23T00:00:00",
		defaultVoice: "marin",
		voices: [
			{ id: "marin", label: "Marin" },
			{ id: "cedar", label: "Cedar" },
			{ id: "alloy", label: "Alloy" },
			{ id: "ash", label: "Ash" },
			{ id: "ballad", label: "Ballad" },
			{ id: "coral", label: "Coral" },
			{ id: "echo", label: "Echo" },
			{ id: "sage", label: "Sage" },
			{ id: "shimmer", label: "Shimmer" },
			{ id: "verse", label: "Verse" },
		],
		transport: "WebSocket",
		billing: "OpenAI usage events",
	},
	{
		id: "openai:gpt-realtime-2",
		label: "OpenAI GPT-Realtime-2",
		provider: "openai",
		providerLabel: "OpenAI",
		logoId: "openai",
		model: "gpt-realtime-2",
		releaseDate: "2026-05-07T00:00:00",
		defaultVoice: "marin",
		voices: [
			{ id: "marin", label: "Marin" },
			{ id: "cedar", label: "Cedar" },
			{ id: "alloy", label: "Alloy" },
			{ id: "ash", label: "Ash" },
			{ id: "ballad", label: "Ballad" },
			{ id: "coral", label: "Coral" },
			{ id: "echo", label: "Echo" },
			{ id: "sage", label: "Sage" },
			{ id: "shimmer", label: "Shimmer" },
			{ id: "verse", label: "Verse" },
		],
		transport: "WebSocket",
		billing: "OpenAI usage events",
	},
	{
		id: "openai:gpt-realtime-2.1",
		label: "OpenAI GPT-Realtime-2.1",
		provider: "openai",
		providerLabel: "OpenAI",
		logoId: "openai",
		model: "gpt-realtime-2.1",
		releaseDate: "2026-07-06T00:00:00",
		defaultVoice: "marin",
		voices: [
			{ id: "marin", label: "Marin" },
			{ id: "cedar", label: "Cedar" },
			{ id: "alloy", label: "Alloy" },
			{ id: "ash", label: "Ash" },
			{ id: "ballad", label: "Ballad" },
			{ id: "coral", label: "Coral" },
			{ id: "echo", label: "Echo" },
			{ id: "sage", label: "Sage" },
			{ id: "shimmer", label: "Shimmer" },
			{ id: "verse", label: "Verse" },
		],
		transport: "WebSocket",
		billing: "OpenAI usage events",
	},
	{
		id: "openai:gpt-realtime-2.1-mini",
		label: "OpenAI GPT-Realtime-2.1 Mini",
		provider: "openai",
		providerLabel: "OpenAI",
		logoId: "openai",
		model: "gpt-realtime-2.1-mini",
		releaseDate: "2026-07-06T00:00:00",
		defaultVoice: "marin",
		voices: [
			{ id: "marin", label: "Marin" },
			{ id: "cedar", label: "Cedar" },
			{ id: "alloy", label: "Alloy" },
			{ id: "ash", label: "Ash" },
			{ id: "ballad", label: "Ballad" },
			{ id: "coral", label: "Coral" },
			{ id: "echo", label: "Echo" },
			{ id: "sage", label: "Sage" },
			{ id: "shimmer", label: "Shimmer" },
			{ id: "verse", label: "Verse" },
		],
		transport: "WebSocket",
		billing: "OpenAI usage events",
	},
	{
		id: "xai:grok-voice-latest",
		label: "Grok Voice Latest",
		provider: "xai",
		providerLabel: "xAI",
		logoId: "xai",
		model: "grok-voice-latest",
		releaseDate: "2026-04-23T00:00:00",
		defaultVoice: "eve",
		voices: XAI_GROK_VOICES,
		transport: "WebSocket",
		billing: "xAI duration meter",
	},
	{
		id: "google:gemini-3.1-flash-live-preview",
		label: "Gemini 3.1 Flash Live Preview",
		provider: "google",
		providerLabel: "Google",
		logoId: "google",
		model: "gemini-3.1-flash-live-preview",
		releaseDate: "2026-03-01T00:00:00",
		defaultVoice: "Puck",
		voices: GOOGLE_LIVE_VOICES,
		transport: "WebSocket",
		billing: "Google usage metadata",
	},
];

const BUDGET_CLOSING_INSTRUCTIONS =
	"The realtime session budget is almost exhausted. Briefly tell the user that this voice session is ending, finish the current thought, and do not ask a follow-up question.";

type OpenAIRealtimePriceTable = {
	inputTextPerMillion: number;
	cachedTextPerMillion: number;
	outputTextPerMillion: number;
	inputAudioPerMillion: number;
	cachedAudioPerMillion: number;
	outputAudioPerMillion: number;
};

const OPENAI_REALTIME_PRICES: Record<string, OpenAIRealtimePriceTable> = {
	"gpt-realtime-2.1": {
		inputTextPerMillion: 4,
		cachedTextPerMillion: 0.4,
		outputTextPerMillion: 24,
		inputAudioPerMillion: 32,
		cachedAudioPerMillion: 0.4,
		outputAudioPerMillion: 64,
	},
	"gpt-realtime-2.1-mini": {
		inputTextPerMillion: 0.6,
		cachedTextPerMillion: 0.06,
		outputTextPerMillion: 2.4,
		inputAudioPerMillion: 10,
		cachedAudioPerMillion: 0.3,
		outputAudioPerMillion: 20,
	},
};

const DEFAULT_OPENAI_REALTIME_PRICES: OpenAIRealtimePriceTable = {
	inputTextPerMillion: 4,
	cachedTextPerMillion: 0.4,
	outputTextPerMillion: 24,
	inputAudioPerMillion: 32,
	cachedAudioPerMillion: 0.4,
	outputAudioPerMillion: 64,
};
const XAI_AUDIO_PRICE_PER_MINUTE = 0.05;
const XAI_TEXT_MESSAGE_PRICE = 0.004;
const GOOGLE_PRICES = {
	inputTextPerMillion: 0.75,
	inputAudioPerMillion: 3,
	outputTextPerMillion: 4.5,
	outputAudioPerMillion: 12,
};
const GOOGLE_SPEECH_RMS_THRESHOLD = 0.012;
const GOOGLE_ACTIVITY_END_SILENCE_MS = 1_100;
const PROVIDER_DRAIN_TIMEOUT_MS = 20_000;
const OUTPUT_DRAIN_PADDING_MS = 350;
const SHOW_REALTIME_DIAGNOSTIC_DETAILS = process.env.NODE_ENV !== "production";

const REALTIME_CAPABILITY_IDS = ["audio.realtime", "realtime"];
const REALTIME_RELEASE_DATE_OVERRIDES: Record<string, string> = {
	"google:gemini-3.1-flash-live-preview": "2026-03-01T00:00:00",
	"google:google/gemini-3.1-flash-live-preview": "2026-03-01T00:00:00",
	"xai:grok-voice-latest": "2026-04-23T00:00:00",
	"xai:x-ai/grok-voice-latest": "2026-04-23T00:00:00",
};

type PcmInputChunk = {
	durationMs: number;
	rms: number;
};

type RealtimeUsageAggregate = {
	input_text_tokens?: number;
	output_text_tokens?: number;
	input_audio_tokens?: number;
	output_audio_tokens?: number;
	cached_read_text_tokens?: number;
	cached_read_audio_tokens?: number;
	input_audio_ms?: number;
	output_audio_ms?: number;
	audio_ms?: number;
	input_text_messages?: number;
	assistant_response_in_flight?: boolean;
};

type RealtimeDiagnosticLevel = "info" | "warning" | "error";

type RealtimeDiagnosticLog = {
	id: string;
	at: string;
	level: RealtimeDiagnosticLevel;
	message: string;
	detail?: string;
};

function toNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function openAIPricesForModel(model: string | null | undefined) {
	if (!model) return DEFAULT_OPENAI_REALTIME_PRICES;
	return OPENAI_REALTIME_PRICES[model] ?? DEFAULT_OPENAI_REALTIME_PRICES;
}

function calculateOpenAICost(
	usage: RealtimeUsage,
	model: string | null | undefined,
): number {
	const prices = openAIPricesForModel(model);
	const input = usage.input_token_details ?? {};
	const output = usage.output_token_details ?? {};
	const cached = input.cached_tokens_details ?? {};
	const cachedText = toNumber(cached.text_tokens);
	const cachedAudio = toNumber(cached.audio_tokens);
	const billableTextInput = Math.max(0, toNumber(input.text_tokens) - cachedText);
	const billableAudioInput = Math.max(
		0,
		toNumber(input.audio_tokens) - cachedAudio,
	);

	return (
		(billableTextInput / 1_000_000) * prices.inputTextPerMillion +
		(cachedText / 1_000_000) * prices.cachedTextPerMillion +
		(toNumber(output.text_tokens) / 1_000_000) * prices.outputTextPerMillion +
		(billableAudioInput / 1_000_000) * prices.inputAudioPerMillion +
		(cachedAudio / 1_000_000) * prices.cachedAudioPerMillion +
		(toNumber(output.audio_tokens) / 1_000_000) * prices.outputAudioPerMillion
	);
}

function addOpenAIUsageToAggregate(
	current: RealtimeUsageAggregate,
	usage: RealtimeUsage,
): RealtimeUsageAggregate {
	const input = usage.input_token_details ?? {};
	const output = usage.output_token_details ?? {};
	const cached = input.cached_tokens_details ?? {};
	const cachedText = toNumber(cached.text_tokens);
	const cachedAudio = toNumber(cached.audio_tokens);
	return {
		input_text_tokens:
			toNumber(current.input_text_tokens) +
			Math.max(0, toNumber(input.text_tokens) - cachedText),
		input_audio_tokens:
			toNumber(current.input_audio_tokens) +
			Math.max(0, toNumber(input.audio_tokens) - cachedAudio),
		output_text_tokens:
			toNumber(current.output_text_tokens) + toNumber(output.text_tokens),
		output_audio_tokens:
			toNumber(current.output_audio_tokens) + toNumber(output.audio_tokens),
		cached_read_text_tokens:
			toNumber(current.cached_read_text_tokens) + cachedText,
		cached_read_audio_tokens:
			toNumber(current.cached_read_audio_tokens) + cachedAudio,
	};
}

function addDurationToAggregate(
	current: RealtimeUsageAggregate,
	field: "input_audio_ms" | "output_audio_ms" | "audio_ms",
	durationMs: number,
): RealtimeUsageAggregate {
	const nextMs = Math.max(0, toNumber(current[field]) + Math.max(0, durationMs));
	const next: RealtimeUsageAggregate = {
		...current,
		[field]: nextMs,
	};
	const inputMs = field === "input_audio_ms" ? nextMs : toNumber(next.input_audio_ms);
	const outputMs = field === "output_audio_ms" ? nextMs : toNumber(next.output_audio_ms);
	if (field !== "audio_ms" && inputMs + outputMs > 0) {
		next.audio_ms = inputMs + outputMs;
	}
	return next;
}

function getGoogleModalityTokens(
	details: GoogleModalityTokenCount[] | undefined,
	modality: string,
): number {
	return (details ?? []).reduce((total, item) => {
		if (String(item.modality ?? "").toLowerCase() !== modality) return total;
		return total + toNumber(item.tokenCount);
	}, 0);
}

function calculateGoogleCost(usage: GoogleUsageMetadata): number {
	const inputTextTokens = getGoogleModalityTokens(
		usage.promptTokensDetails,
		"text",
	);
	const inputAudioTokens = getGoogleModalityTokens(
		usage.promptTokensDetails,
		"audio",
	);
	const outputTextTokens = getGoogleModalityTokens(
		usage.responseTokensDetails,
		"text",
	);
	const outputAudioTokens = getGoogleModalityTokens(
		usage.responseTokensDetails,
		"audio",
	);

	return (
		(inputTextTokens / 1_000_000) * GOOGLE_PRICES.inputTextPerMillion +
		(inputAudioTokens / 1_000_000) * GOOGLE_PRICES.inputAudioPerMillion +
		(outputTextTokens / 1_000_000) * GOOGLE_PRICES.outputTextPerMillion +
		(outputAudioTokens / 1_000_000) * GOOGLE_PRICES.outputAudioPerMillion
	);
}

function googleUsageMetadataToAggregate(
	usage: GoogleUsageMetadata,
): RealtimeUsageAggregate {
	const inputTextTokens = getGoogleModalityTokens(
		usage.promptTokensDetails,
		"text",
	);
	const inputAudioTokens = getGoogleModalityTokens(
		usage.promptTokensDetails,
		"audio",
	);
	const outputTextTokens = getGoogleModalityTokens(
		usage.responseTokensDetails,
		"text",
	);
	const outputAudioTokens = getGoogleModalityTokens(
		usage.responseTokensDetails,
		"audio",
	);

	return {
		...(inputTextTokens > 0 ? { input_text_tokens: inputTextTokens } : {}),
		...(inputAudioTokens > 0 ? { input_audio_tokens: inputAudioTokens } : {}),
		...(outputTextTokens > 0 ? { output_text_tokens: outputTextTokens } : {}),
		...(outputAudioTokens > 0 ? { output_audio_tokens: outputAudioTokens } : {}),
	};
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatElapsedSeconds(ms: number): string {
	return `${Math.floor(ms / 1000).toLocaleString("en-US")}s`;
}

function formatDiagnosticDetail(value: unknown): string | undefined {
	if (value == null) return undefined;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2).slice(0, 1200);
	} catch {
		return String(value).slice(0, 1200);
	}
}

function getErrorMessage(value: unknown): string {
	if (value instanceof Error && value.message.trim()) return value.message;
	if (typeof value === "string" && value.trim()) return value.trim();
	return "Realtime session failed.";
}

function isMicrophonePermissionError(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const error = value as { name?: unknown; message?: unknown };
	const name = String(error.name ?? "").toLowerCase();
	const message = String(error.message ?? "").toLowerCase();
	return (
		name === "notallowederror" ||
		name === "securityerror" ||
		message.includes("permission denied") ||
		message.includes("permission dismissed") ||
		message.includes("permission has been denied")
	);
}

function getRealtimeStartupErrorMessage(value: unknown): string {
	if (isMicrophonePermissionError(value)) {
		return "Microphone permission is blocked. Allow microphone access for this site in the browser, then start the realtime session again.";
	}
	return getErrorMessage(value);
}

function getSessionErrorMessage(payload: unknown, status: number): string {
	if (!payload || typeof payload !== "object") {
		return `Session request failed (${status}).`;
	}
	const record = payload as Record<string, unknown>;
	for (const field of ["message", "description", "reason", "error"] as const) {
		const value = record[field];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	const details = record.details;
	if (details && typeof details === "object") {
		try {
			return JSON.stringify(details);
		} catch {
			return `Session request failed (${status}).`;
		}
	}
	return `Session request failed (${status}).`;
}

function describeRealtimeMessage(raw: MessageEvent | string) {
	const data = typeof raw === "string" ? raw : raw.data;
	if (typeof data === "string") {
		return { dataType: "string", preview: data.slice(0, 500) };
	}
	if (data instanceof Blob) {
		return { dataType: "Blob", size: data.size, type: data.type };
	}
	if (data instanceof ArrayBuffer) {
		return { dataType: "ArrayBuffer", byteLength: data.byteLength };
	}
	if (ArrayBuffer.isView(data)) {
		return {
			dataType: data.constructor.name,
			byteLength: data.byteLength,
		};
	}
	return { dataType: typeof data, preview: String(data).slice(0, 500) };
}

async function parseRealtimeEvent(
	raw: MessageEvent | string,
): Promise<Record<string, unknown> | null> {
	try {
		const rawData = typeof raw === "string" ? raw : raw.data;
		const data =
			typeof rawData === "string"
				? rawData
				: rawData instanceof Blob
					? await rawData.text()
					: rawData instanceof ArrayBuffer
						? new TextDecoder().decode(rawData)
						: ArrayBuffer.isView(rawData)
							? new TextDecoder().decode(rawData)
							: String(rawData);
		const parsed = JSON.parse(data) as unknown;
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function summarizeGoogleLiveEvent(event: Record<string, unknown>) {
	const serverContent = getRecordField(event, "serverContent");
	const modelTurn = serverContent ? getRecordField(serverContent, "modelTurn") : null;
	const parts = modelTurn
		? getArrayField<Record<string, unknown>>(modelTurn, "parts")
		: [];
	return {
		keys: Object.keys(event),
		setupComplete: Boolean(event.setupComplete),
		hasServerContent: Boolean(serverContent),
		hasGoAway: Boolean(getRecordField(event, "goAway")),
		hasToolCall: Boolean(getRecordField(event, "toolCall")),
		hasSessionResumptionUpdate: Boolean(
			getRecordField(event, "sessionResumptionUpdate"),
		),
		generationComplete: Boolean(serverContent?.generationComplete),
		turnComplete: Boolean(serverContent?.turnComplete),
		waitingForInput: Boolean(serverContent?.waitingForInput),
		turnCompleteReason: serverContent?.turnCompleteReason,
		interrupted: Boolean(serverContent?.interrupted),
		hasInputTranscription: Boolean(
			serverContent && getRecordField(serverContent, "inputTranscription"),
		),
		hasOutputTranscription: Boolean(
			serverContent && getRecordField(serverContent, "outputTranscription"),
		),
		partCount: parts.length,
		audioParts: parts.filter((part) => getRecordField(part, "inlineData")).length,
		textParts: parts.filter((part) => getStringField(part, "text")).length,
		hasUsageMetadata: Boolean(getRecordField(event, "usageMetadata")),
		hasServerError: Boolean(getRecordField(event, "error")),
	};
}

function appendTextLine(
	lines: TranscriptLine[],
	next: Omit<TranscriptLine, "id"> & { id?: string },
): TranscriptLine[] {
	const id = next.id ?? `${next.role}-${crypto.randomUUID()}`;
	const existingIndex = lines.findIndex((line) => line.id === id);
	if (existingIndex >= 0) {
		return lines.map((line, index) =>
			index === existingIndex
				? {
						...line,
						text: `${line.text}${next.text}`,
						final: next.final ?? line.final,
					}
				: line,
		);
	}
	const { id: _ignoredId, ...line } = next;
	return [...lines, { id, ...line }];
}

function replaceTextLine(
	lines: TranscriptLine[],
	next: Omit<TranscriptLine, "id"> & { id: string },
): TranscriptLine[] {
	const existingIndex = lines.findIndex((line) => line.id === next.id);
	if (existingIndex >= 0) {
		return lines.map((line, index) =>
			index === existingIndex ? { ...line, ...next } : line,
		);
	}
	return [...lines, next];
}

function floatTo16BitPcmBase64(input: Float32Array): string {
	const bytes = new Uint8Array(input.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < input.length; i += 1) {
		const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
		view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
	}
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function calculateRms(input: Float32Array): number {
	if (input.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < input.length; i += 1) {
		const sample = input[i] ?? 0;
		sum += sample * sample;
	}
	return Math.sqrt(sum / input.length);
}

function decodeBase64ToPcm16(base64: string): Int16Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Int16Array(bytes.buffer);
}

function createAudioBufferFromPcm16(
	audioContext: AudioContext,
	base64: string,
	sampleRate = 24_000,
): AudioBuffer {
	const pcm = decodeBase64ToPcm16(base64);
	const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
	const channel = buffer.getChannelData(0);
	for (let i = 0; i < pcm.length; i += 1) {
		channel[i] = (pcm[i] ?? 0) / 0x8000;
	}
	return buffer;
}

function StatCard({
	icon,
	label,
	children,
}: {
	icon: ReactNode;
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-3">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				{icon}
				<span>{label}</span>
			</div>
			<div className="mt-2 min-h-7 text-lg font-semibold tabular-nums">
				{children}
			</div>
		</div>
	);
}

function getRealtimeModelDisplayName(model: RealtimeModel): string {
	const providerPrefix = `${model.providerLabel} `;
	return model.label.startsWith(providerPrefix)
		? model.label.slice(providerPrefix.length)
		: model.label;
}

function getDefaultRealtimeSystemPrompt(model: RealtimeModel | null): string {
	return `You are ${model ? getRealtimeModelDisplayName(model) : "the selected realtime model"}.`;
}

function RealtimeModelSelector({
	models,
	selectedModel,
	onSelectModel,
	disabled,
}: {
	models: RealtimeModel[];
	selectedModel: RealtimeModel | null;
	onSelectModel: (modelId: string) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const normalizedSearch = searchValue.trim().toLowerCase();
	const filteredModels = normalizedSearch
		? models.filter((model) =>
				[
					model.label,
					model.model,
					model.providerLabel,
					model.provider,
					model.defaultVoice,
					...model.voices.map((voice) => voice.id),
					model.transport,
				]
					.join(" ")
					.toLowerCase()
					.includes(normalizedSearch),
			)
		: models;
	const groupedModels = useMemo(
		() =>
			normalizedSearch
				? [{ heading: `Results (${filteredModels.length})`, items: filteredModels }]
				: groupModelsByReleaseMonth(filteredModels),
		[filteredModels, normalizedSearch],
	);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearchValue("");
	};

	return (
		<ModelSelector open={open} onOpenChange={handleOpenChange}>
			<ModelSelectorTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={disabled}
					className="h-8 max-w-[min(64vw,360px)] justify-start gap-1.5 px-2"
				>
					{selectedModel ? (
						<Logo
							id={selectedModel.logoId}
							alt={selectedModel.providerLabel}
							width={14}
							height={14}
							className="shrink-0 rounded"
						/>
					) : null}
					<span className="truncate text-xs">
						{selectedModel
							? getRealtimeModelDisplayName(selectedModel)
							: "Select realtime model"}
					</span>
				</Button>
			</ModelSelectorTrigger>
			<ModelSelectorContent
				title="Select a realtime model"
				className="w-[min(92vw,560px)] max-w-none sm:max-w-none"
				commandProps={{ shouldFilter: false }}
			>
				<ModelSelectorInput
					placeholder="Search realtime models..."
					value={searchValue}
					onValueChange={setSearchValue}
				/>
				<ModelSelectorList className="max-h-[70vh]" viewportClassName="p-3">
					<ModelSelectorEmpty>No realtime models found.</ModelSelectorEmpty>
					{groupedModels.map((group, index) => (
						<ModelSelectorGroup
							key={`${group.heading}-${index}`}
							heading={group.heading}
							className="pb-2 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground"
						>
							{group.items.map((model) => (
								<ModelSelectorItem
									key={model.id}
									value={model.id}
									onSelect={() => {
										onSelectModel(model.id);
										setOpen(false);
									}}
									keywords={[
										model.label,
										model.model,
										model.providerLabel,
										model.defaultVoice,
										...model.voices.map((voice) => voice.id),
										model.transport,
									]}
									className={cn(
										"flex min-h-8 items-center gap-2 py-1",
										model.id === selectedModel?.id && "bg-foreground/5",
									)}
								>
									<Logo
										id={model.logoId}
										alt={model.providerLabel}
										width={18}
										height={18}
										className="shrink-0 rounded"
									/>
									<div className="flex min-w-0 flex-1 items-center gap-1.5">
										<span className="truncate text-sm font-medium">
											{getRealtimeModelDisplayName(model)}
										</span>
										{model.id === selectedModel?.id ? (
											<Check className="h-4 w-4 shrink-0 text-foreground/70" />
										) : null}
									</div>
								</ModelSelectorItem>
							))}
						</ModelSelectorGroup>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}

function RealtimeVoiceSelector({
	voices,
	selectedVoiceId,
	onSelectVoice,
	disabled,
}: {
	voices: RealtimeVoiceOption[];
	selectedVoiceId: string;
	onSelectVoice: (voiceId: string) => void;
	disabled: boolean;
}) {
	const selectedVoice =
		voices.find((voice) => voice.id === selectedVoiceId) ?? voices[0] ?? null;
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	const voiceOptions = (
		<div className="space-y-1 p-1">
			{voices.map((voice) => {
				const selected = voice.id === selectedVoice?.id;
				return (
					<button
						key={voice.id}
						type="button"
						aria-selected={selected}
						className={cn(
							"flex w-full items-center gap-3 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
							selected && "bg-muted",
						)}
						onClick={() => {
							onSelectVoice(voice.id);
							setOpen(false);
						}}
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-medium">
								{voice.label ?? voice.id}
							</span>
							{voice.description ? (
								<span className="block truncate text-xs text-muted-foreground">
									{voice.description}
								</span>
							) : null}
						</span>
						{selected ? (
							<Check className="h-4 w-4 shrink-0 text-foreground/70" />
						) : (
							<span className="h-4 w-4 shrink-0" aria-hidden="true" />
						)}
					</button>
				);
			})}
		</div>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					disabled={disabled}
					aria-label="Select realtime voice"
					className="h-8 w-[156px] justify-between gap-1.5 px-2 text-xs font-normal shadow-none hover:bg-muted"
				>
					<span className="flex min-w-0 items-center gap-1.5">
						<Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">
							{selectedVoice?.label ?? selectedVoice?.id ?? "Voice"}
						</span>
					</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={8}
				className="w-64 gap-0 rounded-2xl p-1"
			>
				{voices.length > 8 ? (
					<ScrollArea className="h-80" type="hover">
						{voiceOptions}
					</ScrollArea>
				) : (
					voiceOptions
				)}
			</PopoverContent>
		</Popover>
	);
}

function getStringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

function getRecordField(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | null {
	const value = record[key];
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function getArrayField<T = unknown>(
	record: Record<string, unknown>,
	key: string,
): T[] {
	const value = record[key];
	return Array.isArray(value) ? (value as T[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerFromGatewayModel(model: GatewaySupportedModel): RealtimeProvider | null {
	const providerId = model.providerId.trim().toLowerCase();
	const modelId = model.modelId.trim().toLowerCase();
	if (providerId === "openai" || modelId.startsWith("openai/")) return "openai";
	if (providerId === "x-ai" || providerId === "xai" || modelId.startsWith("x-ai/") || modelId.startsWith("xai/")) {
		return "xai";
	}
	if (providerId === "google-ai-studio" || providerId === "google" || modelId.startsWith("google/")) {
		return "google";
	}
	return null;
}

function providerLabel(provider: RealtimeProvider): string {
	if (provider === "openai") return "OpenAI";
	if (provider === "xai") return "xAI";
	return "Google";
}

function billingLabel(provider: RealtimeProvider): RealtimeModel["billing"] {
	if (provider === "xai") return "xAI duration meter";
	if (provider === "google") return "Google usage metadata";
	return "OpenAI usage events";
}

function fallbackVoiceOptions(provider: RealtimeProvider): RealtimeVoiceOption[] {
	const fallback = REALTIME_MODELS.find((model) => model.provider === provider);
	return fallback?.voices ?? [{ id: fallbackDefaultVoice(provider) }];
}

function fallbackDefaultVoice(provider: RealtimeProvider): string {
	if (provider === "xai") return "eve";
	if (provider === "google") return "Puck";
	return "marin";
}

function titleCaseModelId(modelId: string): string {
	const [, ...parts] = modelId.split("/");
	const value = parts.join("/") || modelId;
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => {
			const lower = part.toLowerCase();
			if (["ai", "gpt"].includes(lower)) return lower.toUpperCase();
			return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
		})
		.join(" ");
}

function realtimeCapabilityParams(model: GatewaySupportedModel): unknown {
	const paramsById = model.capabilityParamsById;
	if (!paramsById) return null;
	for (const capabilityId of REALTIME_CAPABILITY_IDS) {
		const params = paramsById[capabilityId];
		if (params) return params;
	}
	return null;
}

function readRealtimeVoiceOptions(params: unknown, provider: RealtimeProvider): RealtimeVoiceOption[] {
	if (!isRecord(params)) return fallbackVoiceOptions(provider);
	const voice = params.voice ?? params.voices;
	const source = isRecord(voice)
		? voice.values ?? voice.options ?? voice.enum
		: voice;
	if (!Array.isArray(source)) return fallbackVoiceOptions(provider);
	const voices = source
		.map((entry): RealtimeVoiceOption | null => {
			if (typeof entry === "string" && entry.trim()) {
				return { id: entry.trim(), label: entry.trim() };
			}
			if (!isRecord(entry)) return null;
			const id = entry.id ?? entry.value ?? entry.voice_id ?? entry.voiceId;
			if (typeof id !== "string" || !id.trim()) return null;
			const label = entry.label;
			const description = entry.description;
			return {
				id: id.trim(),
				...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
				...(typeof description === "string" && description.trim()
					? { description: description.trim() }
					: {}),
			};
		})
		.filter((voice): voice is RealtimeVoiceOption => Boolean(voice));
	const seen = new Set<string>();
	const deduped = voices.filter((voice) => {
		if (seen.has(voice.id)) return false;
		seen.add(voice.id);
		return true;
	});
	return deduped.length > 0 ? deduped : fallbackVoiceOptions(provider);
}

function readRealtimeDefaultVoice(
	params: unknown,
	voices: RealtimeVoiceOption[],
	provider: RealtimeProvider,
): string {
	const voice = isRecord(params) ? params.voice ?? params.voices : null;
	const defaultVoice = isRecord(voice) ? voice.default ?? voice.default_voice : null;
	if (typeof defaultVoice === "string" && voices.some((option) => option.id === defaultVoice.trim())) {
		return defaultVoice.trim();
	}
	return voices[0]?.id ?? fallbackDefaultVoice(provider);
}

function gatewayModelToRealtimeModel(model: GatewaySupportedModel): RealtimeModel | null {
	const provider = providerFromGatewayModel(model);
	if (!provider) return null;
	const params = realtimeCapabilityParams(model);
	const voices = readRealtimeVoiceOptions(params, provider);
	const labelBase = model.modelName?.trim() || titleCaseModelId(model.selectorModelId || model.modelId);
	const modelKey = model.selectorModelId || model.modelId;
	const releaseDateOverride =
		REALTIME_RELEASE_DATE_OVERRIDES[`${provider}:${modelKey}`] ??
		REALTIME_RELEASE_DATE_OVERRIDES[`${provider}:${model.modelId}`];
	return {
		id: `${provider}:${modelKey}`,
		label: labelBase.startsWith(providerLabel(provider))
			? labelBase
			: `${providerLabel(provider)} ${labelBase}`,
		provider,
		providerLabel: providerLabel(provider),
		logoId: provider === "google" ? "google" : provider,
		model: modelKey,
		releaseDate: releaseDateOverride ?? model.releaseDate ?? model.announcementDate ?? null,
		defaultVoice: readRealtimeDefaultVoice(params, voices, provider),
		voices,
		transport: "WebSocket",
		billing: billingLabel(provider),
	};
}

function parseReleaseTime(value: string | null): number {
	if (!value) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareRealtimeModelsByRelease(a: RealtimeModel, b: RealtimeModel): number {
	const releaseDiff = parseReleaseTime(b.releaseDate) - parseReleaseTime(a.releaseDate);
	if (releaseDiff !== 0) return releaseDiff;
	const providerDiff = a.providerLabel.localeCompare(b.providerLabel);
	if (providerDiff !== 0) return providerDiff;
	return a.label.localeCompare(b.label);
}

function buildRealtimeModels(models: GatewaySupportedModel[]): RealtimeModel[] {
	const mapped = filterModelsForRoom(models, "realtime")
		.map(gatewayModelToRealtimeModel)
		.filter((model): model is RealtimeModel => Boolean(model));
	const seen = new Set<string>();
	const deduped = [...mapped, ...REALTIME_MODELS].filter((model) => {
		if (seen.has(model.id)) return false;
		seen.add(model.id);
		return true;
	});
	return deduped.sort(compareRealtimeModelsByRelease);
}

type RealtimeRoomProps = {
	models?: GatewaySupportedModel[];
};

export function RealtimeRoom({ models = [] }: RealtimeRoomProps) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const realtimeModels = useMemo(() => buildRealtimeModels(models), [models]);
	const suggestedModels = useMemo(() => {
		const ids = [
			"openai:gpt-realtime-2.1",
			"xai:grok-voice-latest",
			"google:gemini-3.1-flash-live-preview",
		];
		return ids
			.map((id) => realtimeModels.find((model) => model.id === id))
			.filter((model): model is RealtimeModel => Boolean(model));
	}, [realtimeModels]);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [selectedVoiceId, setSelectedVoiceId] = useState("");
	const [status, setStatus] = useState<SessionStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [actualCostUsd, setActualCostUsd] = useState(0);
	const [xaiInputAudioMs, setXaiInputAudioMs] = useState(0);
	const [xaiOutputAudioMs, setXaiOutputAudioMs] = useState(0);
	const [xaiTextMessages, setXaiTextMessages] = useState(0);
	const [googleInputAudioMs, setGoogleInputAudioMs] = useState(0);
	const [googleOutputAudioMs, setGoogleOutputAudioMs] = useState(0);
	const [sessionBilling, setSessionBilling] = useState<
		RealtimeSessionResponse["billing"] | null
	>(null);
	const [budgetState, setBudgetState] = useState<
		"normal" | "extension_needed" | "graceful_stop"
	>("normal");
	const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
	const [diagnosticLogs, setDiagnosticLogs] = useState<RealtimeDiagnosticLog[]>(
		[],
	);
	const [lastEventType, setLastEventType] = useState<string>("idle");
	const [personaState, setPersonaState] = useState<PersonaState>("asleep");
	const [isFinishing, setIsFinishing] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [displaySettings, setDisplaySettings] = useState<RealtimeDisplaySettings>(
		() => readRealtimeDisplaySettings(),
	);
	const [personaMountReady, setPersonaMountReady] = useState(false);

	const transcriptEndRef = useRef<HTMLDivElement | null>(null);
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	const dataChannelRef = useRef<RTCDataChannel | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const webSocketRef = useRef<WebSocket | null>(null);
	const inputAudioContextRef = useRef<AudioContext | null>(null);
	const outputAudioContextRef = useRef<AudioContext | null>(null);
	const streamProcessorRef = useRef<ScriptProcessorNode | null>(null);
	const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const outputScheduleRef = useRef(0);
	const xaiInputSpeechStartedAtRef = useRef<number | null>(null);
	const googleLastUsageCostRef = useRef(0);
	const googleLastUsageTotalTokensRef = useRef(0);
	const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
	const gracefulStopRequestedRef = useRef(false);
	const assistantResponseInFlightRef = useRef(false);
	const pendingStopStatusRef = useRef<"completed" | "cancelled" | "expired" | null>(
		null,
	);
	const budgetStopTimerRef = useRef<number | null>(null);
	const googleResponseTimeoutRef = useRef<number | null>(null);
	const providerDrainTimerRef = useRef<number | null>(null);
	const outputDrainTimerRef = useRef<number | null>(null);
	const googleResponseCompleteRef = useRef(false);
	const googleUsageMetadataSeenRef = useRef(false);
	const googleUserTranscriptIdRef = useRef<string | null>(null);
	const googleAssistantTranscriptIdRef = useRef<string | null>(null);
	const currentSessionIdRef = useRef<string | null>(null);
	const finalizedSessionIdRef = useRef<string | null>(null);
	const lastExtendedReservedNanosRef = useRef(0);
	const usageAggregateRef = useRef<RealtimeUsageAggregate>({});
	const relaySessionRef = useRef(false);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				REALTIME_DISPLAY_SETTINGS_STORAGE_KEY,
				JSON.stringify(displaySettings),
			);
		} catch {
			// Non-critical: display settings can fall back to defaults.
		}
	}, [displaySettings]);

	useEffect(() => {
		transcriptEndRef.current?.scrollIntoView({
			block: "end",
			behavior: "smooth",
		});
	}, [transcript]);

	const addDiagnosticLog = useCallback(
		(
			message: string,
			detail?: unknown,
			level: RealtimeDiagnosticLevel = "info",
		) => {
			setDiagnosticLogs((logs) => [
				{
					id: crypto.randomUUID(),
					at: new Date().toLocaleTimeString(),
					level,
					message,
					detail: SHOW_REALTIME_DIAGNOSTIC_DETAILS
						? formatDiagnosticDetail(detail)
						: undefined,
				},
				...logs,
			].slice(0, 16));
		},
		[],
	);

	const clearGoogleResponseTimeout = useCallback(() => {
		if (googleResponseTimeoutRef.current == null) return;
		window.clearTimeout(googleResponseTimeoutRef.current);
		googleResponseTimeoutRef.current = null;
	}, []);

	const scheduleGoogleResponseTimeout = useCallback(() => {
		clearGoogleResponseTimeout();
		googleResponseTimeoutRef.current = window.setTimeout(() => {
			googleResponseTimeoutRef.current = null;
			addDiagnosticLog(
				"Google has not returned model output after audioStreamEnd.",
				{
					inputAudioMs: usageAggregateRef.current.input_audio_ms ?? 0,
					outputAudioMs: usageAggregateRef.current.output_audio_ms ?? 0,
					lastEventType,
				},
				"warning",
			);
			setLastEventType("google_response_timeout");
			setPersonaState("listening");
		}, 12_000);
	}, [addDiagnosticLog, clearGoogleResponseTimeout, lastEventType]);

	useEffect(() => {
		if (!selectedModelId) return;
		if (realtimeModels.some((model) => model.id === selectedModelId)) return;
		setSelectedModelId(null);
		setSelectedVoiceId("");
	}, [realtimeModels, selectedModelId]);

	const selectedModel = useMemo(
		() =>
			selectedModelId
				? realtimeModels.find((model) => model.id === selectedModelId) ?? null
				: null,
		[realtimeModels, selectedModelId],
	);
	const selectedVoiceOptions =
		selectedModel && selectedModel.voices.length > 0
			? selectedModel.voices
			: selectedModel
				? [{ id: selectedModel.defaultVoice }]
				: [];
	const selectedVoice =
		selectedVoiceOptions.find((voice) => voice.id === selectedVoiceId) ??
		selectedVoiceOptions[0] ??
		null;
	const orbMode = displaySettings.orbMode;
	const showSimpleOrb = orbMode === "simple";
	const showRichPersonaOrb = orbMode === "persona";
	const showOrb = orbMode !== "off";
	const defaultSystemPrompt = useMemo(
		() => getDefaultRealtimeSystemPrompt(selectedModel),
		[selectedModel],
	);
	const realtimeSystemPrompt =
		displaySettings.systemPrompt?.trim() || defaultSystemPrompt;

	useEffect(() => {
		setPersonaMountReady(false);
		if (!selectedModel || !showRichPersonaOrb) return;
		const timeout = window.setTimeout(() => {
			setPersonaMountReady(true);
		}, 700);
		return () => window.clearTimeout(timeout);
	}, [selectedModel?.id, showRichPersonaOrb]);

	useEffect(() => {
		if (!selectedModel) return;
		const hasSelectedVoice = selectedModel.voices.some(
			(voice) => voice.id === selectedVoiceId,
		);
		if (!hasSelectedVoice) {
			setSelectedVoiceId(selectedModel.defaultVoice);
		}
	}, [selectedModel, selectedVoiceId]);

	const xaiEstimatedCostUsd =
		((xaiInputAudioMs + xaiOutputAudioMs) / 60_000) *
			XAI_AUDIO_PRICE_PER_MINUTE +
		xaiTextMessages * XAI_TEXT_MESSAGE_PRICE;
	const displayedCostUsd =
		selectedModel?.provider === "xai"
			? xaiEstimatedCostUsd
			: actualCostUsd;
	const reservedBudgetUsd = sessionBilling?.reservationUsd ?? 0;
	const remainingBudgetUsd = Math.max(0, reservedBudgetUsd - displayedCostUsd);
	const budgetRatio =
		reservedBudgetUsd > 0 ? displayedCostUsd / reservedBudgetUsd : 0;
	const costLabel =
		!selectedModel
			? "Cost"
			: selectedModel.provider === "xai"
			? "Estimated cost"
			: selectedModel.provider === "google"
				? "Usage cost"
				: "Actual cost";

	const currentUsagePayload = useCallback(
		(): RealtimeUsageAggregate => ({
			...usageAggregateRef.current,
			...(assistantResponseInFlightRef.current
				? { assistant_response_in_flight: true }
				: {}),
		}),
		[],
	);

	const finalizeCurrentSession = useCallback(
		async (status: "completed" | "cancelled" | "expired" = "completed") => {
			if (relaySessionRef.current) return;
			const sessionId = currentSessionIdRef.current;
			if (!sessionId || finalizedSessionIdRef.current === sessionId) return;
			finalizedSessionIdRef.current = sessionId;
			await fetch(`/api/chat/realtime/session/${encodeURIComponent(sessionId)}/finalize`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status,
					usage: currentUsagePayload(),
					disconnect_reason:
						status === "expired" ? "reserved_credit_exhausted" : "client_closed",
				}),
			}).catch(() => undefined);
		},
		[currentUsagePayload],
	);

	const markSessionConnected = useCallback(async (session: RealtimeSessionResponse) => {
		const sessionId = session.session_id ?? session.id;
		if (!sessionId) return;
		await fetch(`/api/chat/realtime/session/${encodeURIComponent(sessionId)}/connected`, {
			method: "POST",
		}).catch(() => undefined);
	}, []);

	const ensureMicrophoneAccess = useCallback(async () => {
		if (localStreamRef.current?.active) return localStreamRef.current;
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error(
				"Microphone capture is not available in this browser context.",
			);
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			localStreamRef.current = stream;
			return stream;
		} catch (error) {
			throw error;
		}
	}, []);

	const persistCurrentUsage = useCallback(async (estimatedCostUsd?: number) => {
		if (relaySessionRef.current) return;
		const sessionId = currentSessionIdRef.current;
		if (!sessionId || finalizedSessionIdRef.current === sessionId) return;
		await fetch(`/api/chat/realtime/session/${encodeURIComponent(sessionId)}/usage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				usage: currentUsagePayload(),
				estimated_cost_nanos: Math.round(
					(estimatedCostUsd ?? displayedCostUsd) * 1_000_000_000,
				),
			}),
		}).catch(() => undefined);
	}, [currentUsagePayload, displayedCostUsd]);

	const clearStopTimers = useCallback(() => {
		if (budgetStopTimerRef.current != null) {
			window.clearTimeout(budgetStopTimerRef.current);
			budgetStopTimerRef.current = null;
		}
		if (providerDrainTimerRef.current != null) {
			window.clearTimeout(providerDrainTimerRef.current);
			providerDrainTimerRef.current = null;
		}
		if (outputDrainTimerRef.current != null) {
			window.clearTimeout(outputDrainTimerRef.current);
			outputDrainTimerRef.current = null;
		}
	}, []);

	const stopInputCapture = useCallback(() => {
		streamProcessorRef.current?.disconnect();
		streamProcessorRef.current = null;
		streamSourceRef.current?.disconnect();
		streamSourceRef.current = null;
		void inputAudioContextRef.current?.close().catch(() => undefined);
		inputAudioContextRef.current = null;
		localStreamRef.current?.getTracks().forEach((track) => track.stop());
		localStreamRef.current = null;
		xaiInputSpeechStartedAtRef.current = null;
	}, []);

	const stopSession = useCallback(
		(
			updateStatus = true,
			terminalStatus?: "completed" | "cancelled" | "expired",
		) => {
			if (updateStatus) {
				if (!relaySessionRef.current) {
					void finalizeCurrentSession(
						terminalStatus ??
							(gracefulStopRequestedRef.current ? "expired" : "cancelled"),
					);
				}
			}
			clearGoogleResponseTimeout();
			clearStopTimers();
			dataChannelRef.current?.close();
			dataChannelRef.current = null;
			peerConnectionRef.current?.close();
			peerConnectionRef.current = null;
			webSocketRef.current?.close();
			webSocketRef.current = null;
			stopInputCapture();
			void outputAudioContextRef.current?.close().catch(() => undefined);
			outputAudioContextRef.current = null;
			outputScheduleRef.current = 0;
			gracefulStopRequestedRef.current = false;
			assistantResponseInFlightRef.current = false;
			pendingStopStatusRef.current = null;
			googleResponseCompleteRef.current = false;
			googleUsageMetadataSeenRef.current = false;
			googleUserTranscriptIdRef.current = null;
			googleAssistantTranscriptIdRef.current = null;
			relaySessionRef.current = false;
			setIsFinishing(false);
			currentSessionIdRef.current = null;
			if (updateStatus) {
				setStartedAt(null);
				setStatus((current) => (current === "error" ? current : "ended"));
				setPersonaState("asleep");
			}
		},
		[
			clearGoogleResponseTimeout,
			clearStopTimers,
			finalizeCurrentSession,
			stopInputCapture,
		],
	);

	const completePendingStop = useCallback(() => {
		const terminalStatus = pendingStopStatusRef.current;
		if (!terminalStatus || assistantResponseInFlightRef.current) return;
		if (providerDrainTimerRef.current != null) {
			window.clearTimeout(providerDrainTimerRef.current);
			providerDrainTimerRef.current = null;
		}
		if (outputDrainTimerRef.current != null) return;

		const audioContext = outputAudioContextRef.current;
		const drainMs = audioContext
			? Math.max(
					0,
					Math.round(
						(outputScheduleRef.current - audioContext.currentTime) * 1000,
					),
				) + OUTPUT_DRAIN_PADDING_MS
			: 0;
		outputDrainTimerRef.current = window.setTimeout(() => {
			outputDrainTimerRef.current = null;
			stopSession(true, terminalStatus);
		}, Math.min(5_000, drainMs));
	}, [stopSession]);

	const requestStopSession = useCallback(
		(terminalStatus: "cancelled" | "expired" = "cancelled") => {
			if (status !== "connected" && status !== "connecting") {
				stopSession(true, terminalStatus);
				return;
			}

			stopInputCapture();
			if (!assistantResponseInFlightRef.current) {
				stopSession(true, terminalStatus);
				return;
			}

			pendingStopStatusRef.current = terminalStatus;
			setIsFinishing(true);
			setLastEventType("finishing_response");
			addDiagnosticLog(
				"Stop requested while assistant response is active; waiting for final usage event.",
				{ terminalStatus, timeoutMs: PROVIDER_DRAIN_TIMEOUT_MS },
				"info",
			);
			setTranscript((lines) =>
				appendTextLine(lines, {
					id: "system-finishing-response",
					role: "system",
					text: "Finishing the current assistant response before closing the session.",
					final: true,
				}),
			);

			if (providerDrainTimerRef.current != null) {
				window.clearTimeout(providerDrainTimerRef.current);
			}
			providerDrainTimerRef.current = window.setTimeout(() => {
				providerDrainTimerRef.current = null;
				addDiagnosticLog(
					"Provider did not emit final usage before the stop timeout.",
					{
						terminalStatus,
						lastEventType,
						assistantResponseInFlight: assistantResponseInFlightRef.current,
					},
					"warning",
				);
				stopSession(true, terminalStatus);
			}, PROVIDER_DRAIN_TIMEOUT_MS);
		},
		[addDiagnosticLog, lastEventType, status, stopInputCapture, stopSession],
	);

	const requestGracefulBudgetStop = useCallback(() => {
		if (gracefulStopRequestedRef.current) return;
		gracefulStopRequestedRef.current = true;
		setBudgetState("graceful_stop");
		setTranscript((lines) =>
			appendTextLine(lines, {
				id: "system-budget-stop",
				role: "system",
				text: "The realtime credit hold is nearly exhausted. Asking the assistant to close the session.",
				final: true,
			}),
		);
		toast.warning("Realtime budget nearly exhausted. Closing the session.");

		const dataChannel = dataChannelRef.current;
		if (dataChannel?.readyState === "open") {
			dataChannel.send(
				JSON.stringify({
					type: "response.create",
					response: {
						modalities: ["audio", "text"],
						instructions: BUDGET_CLOSING_INSTRUCTIONS,
					},
				}),
			);
		}

		const webSocket = webSocketRef.current;
		if (webSocket?.readyState === WebSocket.OPEN) {
			if (selectedModel?.provider === "google") {
				webSocket.send(
					JSON.stringify({
						clientContent: {
							turns: [
								{
									role: "user",
									parts: [{ text: BUDGET_CLOSING_INSTRUCTIONS }],
								},
							],
							turnComplete: true,
						},
					}),
				);
			} else {
				webSocket.send(
					JSON.stringify({
						type: "response.create",
						response: {
							modalities: ["audio", "text"],
							instructions: BUDGET_CLOSING_INSTRUCTIONS,
						},
					}),
				);
			}
		}

		budgetStopTimerRef.current = window.setTimeout(() => {
			requestStopSession("expired");
		}, 8000);
	}, [requestStopSession, selectedModel?.provider]);

	useEffect(() => {
		if (!startedAt) return;
		const interval = window.setInterval(() => {
			setElapsedMs(Date.now() - startedAt);
		}, 250);
		return () => window.clearInterval(interval);
	}, [startedAt]);

	useEffect(() => () => stopSession(false), [stopSession]);

	useEffect(() => {
		if (status !== "connected" || !sessionBilling) return;
		if (relaySessionRef.current) return;
		if (budgetRatio >= sessionBilling.gracefulStopThreshold) {
			requestGracefulBudgetStop();
			return;
		}
		if (budgetRatio >= sessionBilling.extendThreshold) {
			setBudgetState("extension_needed");
			return;
		}
		setBudgetState("normal");
	}, [budgetRatio, requestGracefulBudgetStop, sessionBilling, status]);

	useEffect(() => {
		if (status !== "connected" || !sessionBilling) return;
		const reservedNanos = sessionBilling.reservationNanos;
		if (budgetRatio < sessionBilling.extendThreshold) return;
		if (reservedNanos <= lastExtendedReservedNanosRef.current) return;
		lastExtendedReservedNanosRef.current = reservedNanos;
		const sessionId = currentSessionIdRef.current;
		if (!sessionId) return;
		void fetch(`/api/chat/realtime/session/${encodeURIComponent(sessionId)}/extend`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				target_reserved_nanos: reservedNanos + 5_000_000_000,
				estimated_cost_nanos: Math.round(displayedCostUsd * 1_000_000_000),
			}),
		})
			.then((response) => response.json().catch(() => null))
			.then((payload) => {
				if (payload?.billing) {
					setSessionBilling(payload.billing);
					setBudgetState("normal");
				}
			})
			.catch(() => undefined);
	}, [budgetRatio, displayedCostUsd, sessionBilling, status]);

	useEffect(() => {
		if (status !== "connected") return;
		if (relaySessionRef.current) return;
		const interval = window.setInterval(() => {
			void persistCurrentUsage();
		}, 5000);
		return () => window.clearInterval(interval);
	}, [persistCurrentUsage, status]);

	useEffect(() => {
		if (status !== "connected") return;
		if (relaySessionRef.current) return;
		const finalizeOnPageHide = () => {
			const sessionId = currentSessionIdRef.current;
			if (!sessionId || finalizedSessionIdRef.current === sessionId) return;
			finalizedSessionIdRef.current = sessionId;
			const body = JSON.stringify({
				status: "cancelled",
				usage: currentUsagePayload(),
				estimated_cost_nanos: Math.round(displayedCostUsd * 1_000_000_000),
				disconnect_reason: "page_hidden",
			});
			navigator.sendBeacon?.(
				`/api/chat/realtime/session/${encodeURIComponent(sessionId)}/finalize`,
				new Blob([body], { type: "application/json" }),
			);
		};
		window.addEventListener("pagehide", finalizeOnPageHide);
		return () => window.removeEventListener("pagehide", finalizeOnPageHide);
	}, [currentUsagePayload, displayedCostUsd, status]);

	const playPcm16Audio = useCallback((base64: string): number => {
		if (!base64) return 0;
		const audioContext =
			outputAudioContextRef.current ?? new AudioContext({ sampleRate: 24_000 });
		outputAudioContextRef.current = audioContext;
		const buffer = createAudioBufferFromPcm16(audioContext, base64);
		const source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);
		const now = audioContext.currentTime;
		const startAt = Math.max(now, outputScheduleRef.current);
		source.start(startAt);
		outputScheduleRef.current = startAt + buffer.duration;
		return Math.round(buffer.duration * 1000);
	}, []);

	const updateGoogleCostFromUsage = useCallback(
		(usage: GoogleUsageMetadata) => {
			const nextAggregate = googleUsageMetadataToAggregate(usage);
			usageAggregateRef.current = {
				...usageAggregateRef.current,
				...nextAggregate,
			};
			const nextCost = calculateGoogleCost(usage);
			const nextTotalTokens =
				toNumber(usage.totalTokenCount) ||
				toNumber(nextAggregate.input_text_tokens) +
					toNumber(nextAggregate.input_audio_tokens) +
					toNumber(nextAggregate.output_text_tokens) +
					toNumber(nextAggregate.output_audio_tokens);
			const previousTotalTokens = googleLastUsageTotalTokensRef.current;
			const previousCost = googleLastUsageCostRef.current;

			if (nextTotalTokens > 0 && nextTotalTokens >= previousTotalTokens) {
				setActualCostUsd((value) => value + Math.max(0, nextCost - previousCost));
				googleLastUsageTotalTokensRef.current = nextTotalTokens;
				googleLastUsageCostRef.current = nextCost;
				void persistCurrentUsage(nextCost);
				return;
			}

			setActualCostUsd((value) => value + nextCost);
			void persistCurrentUsage();
		},
		[persistCurrentUsage],
	);

	const handleRealtimeEvent = useCallback(
		(event: Record<string, unknown>, provider: RealtimeProvider) => {
			const type = getStringField(event, "type");
			if (type) setLastEventType(type);

			if (type === "relay.connected") {
				addDiagnosticLog("Realtime relay ready", event);
				return;
			}

			if (type === "relay.upstream_error") {
				addDiagnosticLog("Provider socket error", event, "error");
				setError("Realtime provider socket failed.");
				setStatus("error");
				setPersonaState("asleep");
				return;
			}

			if (type === "relay.upstream_closed") {
				const phase = getStringField(event, "phase");
				const providerLabel = getStringField(event, "provider") || provider;
				const message =
					phase === "setup"
						? `${providerLabel} socket closed before setup completed.`
						: `${providerLabel} socket closed.`;
				addDiagnosticLog(
					phase === "setup"
						? "Provider socket closed before setup"
						: "Provider socket closed",
					event,
					phase === "setup" ? "error" : "warning",
				);
				if (phase === "setup") {
					setError(message);
					setStatus("error");
					setPersonaState("asleep");
				}
				return;
			}

			const nonGoogleProviderError =
				provider !== "google" ? getRecordField(event, "error") : null;
			if (nonGoogleProviderError) {
				addDiagnosticLog(
					`${providerLabel(provider)} provider error`,
					nonGoogleProviderError,
					"error",
				);
				setError(formatDiagnosticDetail(nonGoogleProviderError) ?? "Realtime provider error.");
				setStatus("error");
				setPersonaState("asleep");
			}

			if (
				type === "input_audio_buffer.speech_started" ||
				type === "conversation.item.input_audio_transcription.updated"
			) {
				setPersonaState("listening");
			}

			if (
				type === "response.created" ||
				type === "response.output_item.added" ||
				type === "response.content_part.added"
			) {
				assistantResponseInFlightRef.current = true;
				setPersonaState("thinking");
			}

			if (type === "response.output_audio_transcript.delta") {
				assistantResponseInFlightRef.current = true;
				setPersonaState("speaking");
				const delta = getStringField(event, "delta");
				if (delta) {
					setTranscript((lines) =>
						appendTextLine(lines, {
							id: getStringField(event, "response_id") || "assistant-live",
							role: "assistant",
							text: delta,
						}),
					);
				}
			}

			if (
				type === "response.output_audio_transcript.done" ||
				type === "response.audio_transcript.done"
			) {
				setPersonaState("listening");
				setTranscript((lines) =>
					replaceTextLine(lines, {
						id: getStringField(event, "response_id") || "assistant-live",
						role: "assistant",
						text: getStringField(event, "transcript"),
						final: true,
					}),
				);
			}

			if (type === "conversation.item.input_audio_transcription.updated") {
				const text =
					getStringField(event, "transcript") || getStringField(event, "delta");
				if (text) {
					setTranscript((lines) =>
						replaceTextLine(lines, {
							id: getStringField(event, "item_id") || "user-live",
							role: "user",
							text,
						}),
					);
				}
			}

			if (type === "input_audio_buffer.speech_started" && provider === "xai") {
				xaiInputSpeechStartedAtRef.current = Date.now();
			}

			if (type === "input_audio_buffer.speech_stopped" && provider === "xai") {
				xaiInputSpeechStartedAtRef.current = null;
			}

			if (
				type === "response.output_audio.delta" &&
				(provider === "xai" || (provider === "openai" && relaySessionRef.current))
			) {
				assistantResponseInFlightRef.current = true;
				setPersonaState("speaking");
				const delta = getStringField(event, "delta");
				if (!delta) return;
				const durationMs = playPcm16Audio(delta);
				if (provider === "xai") {
					usageAggregateRef.current = addDurationToAggregate(
						usageAggregateRef.current,
						"output_audio_ms",
						durationMs,
					);
					setXaiOutputAudioMs((value) => value + durationMs);
				}
			}

			if (
				type === "response.output_audio.done" &&
				(provider === "xai" || (provider === "openai" && relaySessionRef.current))
			) {
				outputScheduleRef.current = outputAudioContextRef.current?.currentTime ?? 0;
				if (provider === "xai") {
					assistantResponseInFlightRef.current = false;
					setPersonaState("listening");
					completePendingStop();
				}
			}

			if (type === "response.done") {
				assistantResponseInFlightRef.current = false;
				setPersonaState("listening");
				const response = getRecordField(event, "response");
				const usage = response ? getRecordField(response, "usage") : null;
				if (usage) {
					usageAggregateRef.current = addOpenAIUsageToAggregate(
						usageAggregateRef.current,
						usage as RealtimeUsage,
					);
					void persistCurrentUsage();
					setActualCostUsd(
						(value) =>
							value +
							calculateOpenAICost(usage as RealtimeUsage, selectedModel?.model),
					);
				}
				completePendingStop();
			}

			if (provider !== "google") return;

			const googleSummary = summarizeGoogleLiveEvent(event);
			console.info("[google-live:event]", googleSummary);
			addDiagnosticLog("Google event", googleSummary);
			const providerError = getRecordField(event, "error");
			if (providerError) {
				console.error("[google-live:error]", providerError);
				clearGoogleResponseTimeout();
				addDiagnosticLog("Google provider error", providerError, "error");
				setError(JSON.stringify(providerError));
				setStatus("error");
				setPersonaState("asleep");
			}
			if (
				googleSummary.audioParts > 0 ||
				googleSummary.textParts > 0 ||
				googleSummary.hasOutputTranscription ||
				googleSummary.turnComplete ||
				googleSummary.generationComplete
			) {
				clearGoogleResponseTimeout();
			}

			const usageMetadata = getRecordField(event, "usageMetadata");
			if (usageMetadata) {
				googleUsageMetadataSeenRef.current = true;
				updateGoogleCostFromUsage(usageMetadata as GoogleUsageMetadata);
				addDiagnosticLog("Google usage metadata", usageMetadata);
				if (googleResponseCompleteRef.current) {
					assistantResponseInFlightRef.current = false;
					setPersonaState("listening");
					completePendingStop();
				}
			}

			if (event.setupComplete) {
				setLastEventType("setupComplete");
				setPersonaState("listening");
			}

			const serverContent = getRecordField(event, "serverContent");
			if (!serverContent) return;

			const modelTurn = getRecordField(serverContent, "modelTurn");
			const parts = modelTurn
				? getArrayField<Record<string, unknown>>(modelTurn, "parts")
				: [];
			for (const part of parts) {
				const inlineData = getRecordField(part, "inlineData");
				const audio = inlineData ? getStringField(inlineData, "data") : "";
				if (audio) {
					assistantResponseInFlightRef.current = true;
					googleResponseCompleteRef.current = false;
					if (!usageMetadata) googleUsageMetadataSeenRef.current = false;
					setPersonaState("speaking");
					const durationMs = playPcm16Audio(audio);
					usageAggregateRef.current = addDurationToAggregate(
						usageAggregateRef.current,
						"output_audio_ms",
						durationMs,
					);
					setGoogleOutputAudioMs((value) => value + durationMs);
				}

				const text = getStringField(part, "text");
				if (text) {
					assistantResponseInFlightRef.current = true;
					googleResponseCompleteRef.current = false;
					if (!usageMetadata) googleUsageMetadataSeenRef.current = false;
					setPersonaState("speaking");
					const assistantTranscriptId =
						googleAssistantTranscriptIdRef.current ??
						`google-assistant-${crypto.randomUUID()}`;
					googleAssistantTranscriptIdRef.current = assistantTranscriptId;
					setTranscript((lines) =>
						appendTextLine(lines, {
							id: assistantTranscriptId,
							role: "assistant",
							text,
						}),
					);
				}
			}

			const inputTranscription = getRecordField(
				serverContent,
				"inputTranscription",
			);
			const inputText = inputTranscription
				? getStringField(inputTranscription, "text")
				: "";
			if (inputText) {
				setPersonaState("listening");
				const userTranscriptId =
					googleUserTranscriptIdRef.current ??
					`google-user-${crypto.randomUUID()}`;
				googleUserTranscriptIdRef.current = userTranscriptId;
				setTranscript((lines) =>
					replaceTextLine(lines, {
						id: userTranscriptId,
						role: "user",
						text: inputText,
					}),
				);
			}

			const outputTranscription = getRecordField(
				serverContent,
				"outputTranscription",
			);
			const outputText = outputTranscription
				? getStringField(outputTranscription, "text")
				: "";
			if (outputText) {
				assistantResponseInFlightRef.current = true;
				googleResponseCompleteRef.current = false;
				if (!usageMetadata) googleUsageMetadataSeenRef.current = false;
				setPersonaState("speaking");
				const assistantTranscriptId =
					googleAssistantTranscriptIdRef.current ??
					`google-assistant-${crypto.randomUUID()}`;
				googleAssistantTranscriptIdRef.current = assistantTranscriptId;
				setTranscript((lines) =>
					appendTextLine(lines, {
						id: assistantTranscriptId,
						role: "assistant",
						text: outputText,
					}),
				);
			}

			if (serverContent.interrupted) {
				outputScheduleRef.current = outputAudioContextRef.current?.currentTime ?? 0;
				assistantResponseInFlightRef.current = false;
				googleResponseCompleteRef.current = true;
				googleUserTranscriptIdRef.current = null;
				googleAssistantTranscriptIdRef.current = null;
				setPersonaState("listening");
				completePendingStop();
			}

			if (serverContent.turnComplete || serverContent.generationComplete) {
				setLastEventType("turnComplete");
				googleResponseCompleteRef.current = true;
				googleUserTranscriptIdRef.current = null;
				googleAssistantTranscriptIdRef.current = null;
				if (googleUsageMetadataSeenRef.current) {
					assistantResponseInFlightRef.current = false;
					setPersonaState("listening");
					completePendingStop();
				}
			}
		},
		[
			addDiagnosticLog,
			clearGoogleResponseTimeout,
			completePendingStop,
			persistCurrentUsage,
			playPcm16Audio,
			selectedModel?.model,
			updateGoogleCostFromUsage,
		],
	);

	const createSession = useCallback(async () => {
		if (!selectedModel) {
			throw new Error("Select a realtime model before starting.");
		}
		const response = await fetch("/api/chat/realtime/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: selectedModel.provider,
				model: selectedModel.model,
				voice: selectedVoice?.id ?? selectedModel.defaultVoice,
				instructions: realtimeSystemPrompt,
			}),
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(getSessionErrorMessage(payload, response.status));
		}
		return payload as RealtimeSessionResponse;
	}, [realtimeSystemPrompt, selectedModel, selectedVoice]);

	const startOpenAI = useCallback(
		async (session: RealtimeSessionResponse) => {
			const stream = await ensureMicrophoneAccess();
			localStreamRef.current = stream;

			const pc = new RTCPeerConnection();
			peerConnectionRef.current = pc;
			stream.getTracks().forEach((track) => pc.addTrack(track, stream));
			pc.ontrack = (event) => {
				if (remoteAudioRef.current) {
					remoteAudioRef.current.srcObject = event.streams[0] ?? null;
					void remoteAudioRef.current.play().catch(() => undefined);
				}
			};

			const dc = pc.createDataChannel("oai-events");
			dataChannelRef.current = dc;
			dc.onopen = () => {
				setStatus("connected");
				setPersonaState("listening");
				setStartedAt(Date.now());
				void markSessionConnected(session);
				dc.send(
					JSON.stringify({
							type: "session.update",
							session: {
								instructions: realtimeSystemPrompt,
								audio: {
									input: { turn_detection: { type: "server_vad" } },
									output: { voice: session.voice },
							},
						},
					}),
				);
			};
			dc.onmessage = (event) => {
				void parseRealtimeEvent(event).then((parsed) => {
					if (parsed) handleRealtimeEvent(parsed, "openai");
				});
			};

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			const answerResponse = await fetch(session.connect.url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${session.clientSecret}`,
					"Content-Type": "application/sdp",
				},
				body: offer.sdp ?? "",
			});
			if (!answerResponse.ok) {
				throw new Error(await answerResponse.text());
			}
			await pc.setRemoteDescription({
				type: "answer",
				sdp: await answerResponse.text(),
			});
		},
		[
			ensureMicrophoneAccess,
			handleRealtimeEvent,
			markSessionConnected,
			realtimeSystemPrompt,
		],
	);

	const startPcmInputStream = useCallback(
		async (
			sampleRate: number,
			sendAudio: (base64Audio: string, chunk: PcmInputChunk) => boolean | void,
			onAudioSent?: (durationMs: number) => void,
		) => {
			const stream = await ensureMicrophoneAccess();
			localStreamRef.current = stream;
			const audioContext = new AudioContext({ sampleRate });
			inputAudioContextRef.current = audioContext;
			const source = audioContext.createMediaStreamSource(stream);
			const processor = audioContext.createScriptProcessor(4096, 1, 1);
			streamSourceRef.current = source;
			streamProcessorRef.current = processor;
			const mutedMonitor = audioContext.createGain();
			mutedMonitor.gain.value = 0;

			processor.onaudioprocess = (event) => {
				const input = event.inputBuffer.getChannelData(0);
				const chunk = {
					durationMs: Math.round((input.length / sampleRate) * 1000),
					rms: calculateRms(input),
				};
				const sent = sendAudio(floatTo16BitPcmBase64(input), chunk);
				if (sent !== false) onAudioSent?.(chunk.durationMs);
			};
			source.connect(processor);
			processor.connect(mutedMonitor);
			mutedMonitor.connect(audioContext.destination);
		},
		[ensureMicrophoneAccess],
	);

	const startXAI = useCallback(
		async (session: RealtimeSessionResponse) => {
			const ws = new WebSocket(session.connect.url, [
				`xai-client-secret.${session.clientSecret}`,
			]);
			webSocketRef.current = ws;

			ws.onmessage = (message) => {
				void parseRealtimeEvent(message).then((event) => {
					if (event) handleRealtimeEvent(event, "xai");
				});
			};

			await new Promise<void>((resolve, reject) => {
				ws.onerror = () => reject(new Error("xAI WebSocket failed to connect."));
				ws.onopen = () => resolve();
			});

			ws.send(
				JSON.stringify({
					type: "session.update",
					session: {
						voice: session.voice,
						instructions: realtimeSystemPrompt,
						turn_detection: { type: "server_vad" },
						input_audio_format: "pcm16",
						output_audio_format: "pcm16",
					},
				}),
			);

			await startPcmInputStream(
				24_000,
				(audio) => {
					if (pendingStopStatusRef.current) return false;
					if (ws.readyState !== WebSocket.OPEN) return;
					ws.send(
						JSON.stringify({
							type: "input_audio_buffer.append",
							audio,
						}),
					);
				},
				(durationMs) => {
					usageAggregateRef.current = addDurationToAggregate(
						usageAggregateRef.current,
						"input_audio_ms",
						durationMs,
					);
					setXaiInputAudioMs((value) => value + durationMs);
				},
			);

			setStatus("connected");
			setPersonaState("listening");
			setStartedAt(Date.now());
			void markSessionConnected(session);
		},
		[
			handleRealtimeEvent,
			markSessionConnected,
			realtimeSystemPrompt,
			startPcmInputStream,
		],
	);

	const startGoogle = useCallback(
		async (session: RealtimeSessionResponse) => {
			const ws = new WebSocket(session.connect.url);
			webSocketRef.current = ws;
			let resolveSetupComplete: (() => void) | null = null;
			let rejectSetupComplete: ((error: Error) => void) | null = null;
			let setupCompleteTimer: number | null = null;
			const setupCompletePromise = new Promise<void>((resolve, reject) => {
				rejectSetupComplete = reject;
				resolveSetupComplete = () => {
					if (setupCompleteTimer != null) {
						window.clearTimeout(setupCompleteTimer);
						setupCompleteTimer = null;
					}
					resolve();
				};
			});

			ws.onmessage = (message) => {
				void parseRealtimeEvent(message).then((event) => {
					if (event) {
						if (event.setupComplete && resolveSetupComplete) {
							addDiagnosticLog("Google setup complete");
							resolveSetupComplete();
							resolveSetupComplete = null;
							rejectSetupComplete = null;
						}
						handleRealtimeEvent(event, "google");
					} else {
						addDiagnosticLog(
							"Google message could not be parsed",
							describeRealtimeMessage(message),
							"warning",
						);
					}
				});
			};

			ws.onclose = (event) => {
				console.info("[google-live:socket-close]", {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				});
				addDiagnosticLog(
					"Google socket closed",
					{
						code: event.code,
						reason: event.reason,
						wasClean: event.wasClean,
					},
					event.wasClean ? "info" : "warning",
				);
				if (rejectSetupComplete) {
					rejectSetupComplete(
						new Error(
							event.reason || "Google Live socket closed before setup completed.",
						),
					);
					rejectSetupComplete = null;
					resolveSetupComplete = null;
				}
			};

			await new Promise<void>((resolve, reject) => {
				ws.onerror = (event) => {
					console.error("[google-live:socket-error]", event);
					addDiagnosticLog("Google socket error", event, "error");
					reject(new Error("Google Live API WebSocket failed to connect."));
				};
				ws.onopen = () => {
					addDiagnosticLog("Google socket open");
					resolve();
				};
			});

			setupCompleteTimer = window.setTimeout(() => {
				rejectSetupComplete?.(
					new Error("Google Live setup did not complete within 10 seconds."),
				);
				rejectSetupComplete = null;
				resolveSetupComplete = null;
			}, 10_000);

			ws.send(
				JSON.stringify({
					setup: {
						model: `models/${session.model}`,
						generationConfig: {
							responseModalities: ["AUDIO"],
							temperature: 0.7,
							speechConfig: {
								voiceConfig: {
									prebuiltVoiceConfig: {
										voiceName: session.voice,
									},
								},
							},
						},
						systemInstruction: {
							parts: [{ text: realtimeSystemPrompt }],
						},
						inputAudioTranscription: {},
						outputAudioTranscription: {},
						realtimeInputConfig: {
							automaticActivityDetection: {
								disabled: false,
								silenceDurationMs: GOOGLE_ACTIVITY_END_SILENCE_MS,
								prefixPaddingMs: 300,
							},
							activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
							turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
						},
					},
				}),
			);
			setLastEventType("google_setup_sent");
			addDiagnosticLog("Google setup sent", {
				model: session.model,
				voice: session.voice,
				activityDetection: "automatic",
				responseModalities: ["AUDIO"],
			});
			await setupCompletePromise;

			let audioStreamActive = false;
			let lastSpeechAt = 0;
			const sendRealtimeInput = (realtimeInput: Record<string, unknown>) => {
				if (ws.readyState !== WebSocket.OPEN) return false;
				ws.send(JSON.stringify({ realtimeInput }));
				return true;
			};
			await startPcmInputStream(
				16_000,
				(audio, chunk) => {
					if (pendingStopStatusRef.current) return false;
					if (ws.readyState !== WebSocket.OPEN) return;
					const now = performance.now();
					const speechDetected = chunk.rms >= GOOGLE_SPEECH_RMS_THRESHOLD;
					if (speechDetected) {
						lastSpeechAt = now;
						audioStreamActive = true;
						setPersonaState("listening");
					}
					if (!audioStreamActive) return false;

					const sent = sendRealtimeInput({
						audio: {
							mimeType: "audio/pcm;rate=16000",
							data: audio,
						},
					});
					if (!sent) return false;

					if (
						!speechDetected &&
						lastSpeechAt > 0 &&
						now - lastSpeechAt >= GOOGLE_ACTIVITY_END_SILENCE_MS
					) {
						sendRealtimeInput({ audioStreamEnd: true });
						console.info("[google-live:audio-stream-end]", {
							rms: chunk.rms,
							silenceMs: Math.round(now - lastSpeechAt),
						});
						addDiagnosticLog("Sent Google audioStreamEnd", {
							rms: chunk.rms,
							silenceMs: Math.round(now - lastSpeechAt),
							inputAudioMs: usageAggregateRef.current.input_audio_ms ?? 0,
						});
						scheduleGoogleResponseTimeout();
						audioStreamActive = false;
						lastSpeechAt = 0;
						setPersonaState("thinking");
					}
				},
				(durationMs) => {
					usageAggregateRef.current = addDurationToAggregate(
						usageAggregateRef.current,
						"input_audio_ms",
						durationMs,
					);
					setGoogleInputAudioMs((value) => value + durationMs);
				},
			);

			setStatus("connected");
			setPersonaState("listening");
			setStartedAt(Date.now());
			addDiagnosticLog("Google microphone stream started");
			void markSessionConnected(session);
		},
		[
			addDiagnosticLog,
			handleRealtimeEvent,
			markSessionConnected,
			realtimeSystemPrompt,
			scheduleGoogleResponseTimeout,
			startPcmInputStream,
		],
	);

	const startRelay = useCallback(
		async (session: RealtimeSessionResponse) => {
			const ws = new WebSocket(
				session.connect.url,
				session.connect.protocols?.length ? session.connect.protocols : undefined,
			);
			webSocketRef.current = ws;

			ws.onmessage = (message) => {
				void parseRealtimeEvent(message).then((event) => {
					if (event) handleRealtimeEvent(event, session.provider);
				});
			};
			ws.onclose = (event) => {
				addDiagnosticLog(
					"Realtime relay socket closed",
					{ code: event.code, reason: event.reason, wasClean: event.wasClean },
					event.wasClean ? "info" : "warning",
				);
				if (status === "connected" || status === "connecting" || isFinishing) {
					setStatus((current) => (current === "error" ? current : "ended"));
					setPersonaState("asleep");
					setIsFinishing(false);
				}
			};

			await new Promise<void>((resolve, reject) => {
				ws.onerror = () => reject(new Error("Realtime relay WebSocket failed to connect."));
				ws.onopen = () => resolve();
			});

			const sampleRate = session.provider === "google" ? 16_000 : 24_000;
			await startPcmInputStream(
				sampleRate,
				(audio, chunk) => {
					if (pendingStopStatusRef.current) return false;
					if (ws.readyState !== WebSocket.OPEN) return false;
					ws.send(
						JSON.stringify({
							type: "client.audio",
							audio,
							rms: chunk.rms,
						}),
					);
					return true;
				},
				(durationMs) => {
					usageAggregateRef.current = addDurationToAggregate(
						usageAggregateRef.current,
						"input_audio_ms",
						durationMs,
					);
					if (session.provider === "xai") {
						setXaiInputAudioMs((value) => value + durationMs);
					} else if (session.provider === "google") {
						setGoogleInputAudioMs((value) => value + durationMs);
					}
				},
			);

			setStatus("connected");
			setPersonaState("listening");
			setStartedAt(Date.now());
			addDiagnosticLog("Realtime relay connected", {
				provider: session.provider,
				model: session.model,
				voice: session.voice,
			});
		},
		[
			addDiagnosticLog,
			handleRealtimeEvent,
			isFinishing,
			startPcmInputStream,
			status,
		],
	);

	const startSession = useCallback(async () => {
		if (status === "connecting" || status === "connected") return;
		if (!selectedModel) {
			setError("Select a realtime model before starting.");
			return;
		}
		setStatus("connecting");
		setPersonaState("thinking");
		setError(null);
		setElapsedMs(0);
		setActualCostUsd(0);
		setXaiInputAudioMs(0);
		setXaiOutputAudioMs(0);
		setXaiTextMessages(0);
		setGoogleInputAudioMs(0);
		setGoogleOutputAudioMs(0);
		setIsFinishing(false);
		googleLastUsageCostRef.current = 0;
		googleLastUsageTotalTokensRef.current = 0;
		assistantResponseInFlightRef.current = false;
		pendingStopStatusRef.current = null;
		googleResponseCompleteRef.current = false;
		googleUsageMetadataSeenRef.current = false;
		googleUserTranscriptIdRef.current = null;
		googleAssistantTranscriptIdRef.current = null;
		relaySessionRef.current = false;
		setSessionBilling(null);
		setBudgetState("normal");
		gracefulStopRequestedRef.current = false;
		currentSessionIdRef.current = null;
		finalizedSessionIdRef.current = null;
		lastExtendedReservedNanosRef.current = 0;
		usageAggregateRef.current = {};
		setDiagnosticLogs([
			{
				id: crypto.randomUUID(),
				at: new Date().toLocaleTimeString(),
				level: "info",
				message: "Starting realtime session",
			},
		]);
		setTranscript([]);

		try {
			addDiagnosticLog("Requesting microphone access");
			await ensureMicrophoneAccess();
			addDiagnosticLog("Microphone access granted");
			const session = await createSession();
			currentSessionIdRef.current = session.session_id ?? session.id ?? null;
			relaySessionRef.current = session.connect.url.includes("/relay");
			setSessionBilling(session.billing ?? null);
			addDiagnosticLog("Session created", {
				sessionId: session.session_id ?? session.id,
				provider: session.provider,
				model: session.model,
				voice: session.voice,
				transport: session.connect.transport,
				reservationUsd: session.billing?.reservationUsd,
			});
			if (relaySessionRef.current) {
				await startRelay(session);
			} else if (session.provider === "openai") {
				await startOpenAI(session);
			} else if (session.provider === "google") {
				await startGoogle(session);
			} else {
				await startXAI(session);
			}
		} catch (sessionError) {
			stopSession();
			const message = getRealtimeStartupErrorMessage(sessionError);
			setStatus("error");
			setPersonaState("asleep");
			setError(message);
			toast.error(message);
		}
	}, [
		createSession,
		addDiagnosticLog,
		startGoogle,
		startOpenAI,
		startRelay,
		startXAI,
		ensureMicrophoneAccess,
		selectedModel,
		status,
		stopSession,
	]);

	const personaLabel =
		personaState === "asleep"
			? "Sleeping"
			: personaState === "listening"
				? "Listening"
				: personaState === "thinking"
					? "Thinking"
					: personaState === "speaking"
						? "Speaking"
						: "Idle";
	const sessionActive =
		status === "connected" || status === "connecting" || isFinishing;
	const canStartSession = Boolean(selectedModel) && !sessionActive;

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="border-b border-border px-3 py-3 md:px-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="group -ml-1 h-8 w-8"
									onClick={toggleSidebar}
								>
									<ChevronRight
										className={`h-4 w-4 transition-transform duration-200 ${
											sidebarState === "expanded"
												? "rotate-180 group-hover:-translate-x-1"
												: "group-hover:translate-x-1"
										}`}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent
								side={sidebarState === "collapsed" ? "right" : "bottom"}
								align="center"
								sideOffset={8}
							>
								Toggle sidebar
							</TooltipContent>
						</Tooltip>
						<RealtimeModelSelector
							models={realtimeModels}
							selectedModel={selectedModel}
							onSelectModel={setSelectedModelId}
							disabled={sessionActive}
						/>
						<RealtimeVoiceSelector
							voices={selectedVoiceOptions}
							selectedVoiceId={selectedVoice?.id ?? selectedVoiceId}
							onSelectVoice={setSelectedVoiceId}
							disabled={sessionActive || !selectedModel}
						/>
						<Badge variant="outline" className="hidden text-[10px] uppercase sm:inline-flex">
							Voice beta
						</Badge>
					</div>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									aria-label="Open realtime settings"
									onClick={() => setSettingsOpen(true)}
								>
									<Settings className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</header>

			<section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
				<div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
					<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
						{selectedModel ? (
							<div className="flex w-full max-w-3xl flex-col items-center gap-7">
								<div className="flex flex-col items-center gap-3">
									{showOrb ? (
										<div className="relative flex h-56 w-56 items-center justify-center">
											{showSimpleOrb ? (
												<LightweightRealtimeOrb
													state={personaState}
													className="h-44 w-44"
												/>
											) : personaMountReady ? (
												<RealtimePersona
													variant="mana"
													state={personaState}
													className="h-56 w-56"
												/>
											) : (
												<PersonaLoadingPlaceholder className="h-56 w-56" />
											)}
										</div>
									) : (
										<div className="flex min-h-24 w-full max-w-sm items-center justify-center rounded-lg border border-border bg-muted/20 px-6 py-5">
											<div className="flex items-center gap-3">
												<div className="flex h-9 w-9 items-center justify-center rounded-full bg-background ring-1 ring-border">
													<Volume2 className="h-4 w-4 text-muted-foreground" />
												</div>
												<div className="min-w-0">
													<p className="text-sm font-medium">{personaLabel}</p>
													<p className="truncate text-xs text-muted-foreground">
														{selectedModel.label}
													</p>
												</div>
											</div>
										</div>
									)}
									<div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
										<span className="font-medium text-foreground">{personaLabel}</span>
										<span>{selectedModel.label}</span>
										<span>Voice: {selectedVoice?.label ?? selectedVoice?.id}</span>
									</div>
								</div>

								<div className="grid w-full gap-3 sm:grid-cols-2">
									<StatCard icon={<Clock3 className="h-3.5 w-3.5" />} label="Time">
										<span className="tabular-nums">{formatDuration(elapsedMs)}</span>
										<span className="ml-2 text-sm font-normal text-muted-foreground">
											({formatElapsedSeconds(elapsedMs)})
										</span>
									</StatCard>
									<StatCard
										icon={<BadgeDollarSign className="h-3.5 w-3.5" />}
										label={costLabel}
									>
										<NumberFlow
											value={displayedCostUsd}
											locales="en-US"
											format={{
												style: "currency",
												currency: "USD",
												minimumFractionDigits: 5,
												maximumFractionDigits: 5,
											}}
										/>
									</StatCard>
								</div>

								{sessionBilling ? (
									<div className="grid w-full gap-3 sm:grid-cols-2">
										<StatCard
											icon={<BadgeDollarSign className="h-3.5 w-3.5" />}
											label="Reserved"
										>
											<NumberFlow
												value={reservedBudgetUsd}
												locales="en-US"
												format={{
													style: "currency",
													currency: "USD",
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												}}
											/>
										</StatCard>
										<StatCard
											icon={<BadgeDollarSign className="h-3.5 w-3.5" />}
											label="Remaining"
										>
											<NumberFlow
												value={remainingBudgetUsd}
												locales="en-US"
												format={{
													style: "currency",
													currency: "USD",
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												}}
											/>
										</StatCard>
									</div>
								) : null}

								{budgetState !== "normal" ? (
									<div className="flex w-full items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
										<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
										<p>
											{budgetState === "extension_needed"
												? "This session is approaching the reserved credit hold. The production gateway should extend the hold now or prepare to close cleanly."
												: "The reserved credit hold is nearly exhausted. The assistant has been asked to close the session before the transport stops."}
										</p>
									</div>
								) : null}

								{error ? (
									<div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
										{error}
									</div>
								) : null}
							</div>
						) : (
							<div className="w-full max-w-3xl">
								<div className="mb-5 text-center">
									<p className="text-sm font-medium">Choose a realtime model</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Start with one of these live voice models, or open the selector for the full list.
									</p>
								</div>
								<div className="grid gap-3 md:grid-cols-3">
									{suggestedModels.map((model) => (
										<button
											key={model.id}
											type="button"
											onClick={() => setSelectedModelId(model.id)}
											className="group min-h-32 rounded-lg border border-border bg-background px-4 py-3 text-left transition hover:border-foreground/30 hover:bg-muted/30"
										>
											<div className="flex items-center gap-2">
												<Logo
													id={model.logoId}
													alt={model.providerLabel}
													width={18}
													height={18}
													className="shrink-0 rounded"
												/>
												<span className="truncate text-sm font-medium">
													{model.providerLabel}
												</span>
											</div>
											<p className="mt-3 line-clamp-2 text-sm font-semibold leading-5">
												{model.label.replace(`${model.providerLabel} `, "")}
											</p>
											<p className="mt-2 text-xs text-muted-foreground">
												{model.billing} / {model.voices.length} voices
											</p>
										</button>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="flex min-h-20 items-center border-t border-border bg-background px-4">
						<div className="mx-auto flex w-full max-w-3xl gap-2">
							{sessionActive ? (
								<Button
									type="button"
									variant="destructive"
									className="h-11 w-full"
									onClick={() => requestStopSession("cancelled")}
									disabled={isFinishing}
								>
									<Square className="h-4 w-4" />
									{isFinishing ? "Finishing response" : "Stop session"}
								</Button>
							) : (
								<Button
									type="button"
									className="h-11 w-full"
									onClick={startSession}
									disabled={!canStartSession}
								>
									<Mic className="h-4 w-4" />
									{selectedModel ? "Start realtime session" : "Select a model to start"}
								</Button>
							)}
						</div>
					</div>
				</div>

				<aside className="flex min-h-0 flex-col bg-muted/10">
					<div className="border-b border-border px-4 py-3">
						<p className="text-sm font-medium">Live transcript</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Assistant transcript appears when the provider emits audio transcript
							events.
						</p>
					</div>
					<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
						{transcript.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Start a session to see provider events.
							</p>
						) : (
							transcript.map((line) => (
								<div
									key={line.id}
									className={cn(
										"rounded-lg border px-3 py-2 text-sm",
										line.role === "assistant"
											? "border-primary/20 bg-primary/5"
											: line.role === "user"
												? "border-border bg-background"
												: "border-border bg-muted/30 text-muted-foreground",
									)}
								>
									<p className="mb-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
										{line.role}
									</p>
									<p className="whitespace-pre-wrap leading-6">{line.text}</p>
								</div>
							))
						)}
						<div ref={transcriptEndRef} aria-hidden="true" />
					</div>
					<div className="border-t border-border">
						<div className="border-b border-border px-4 py-3">
							<p className="text-sm font-medium">Realtime diagnostics</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Newest provider and transport events.
							</p>
						</div>
						<div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3">
							{diagnosticLogs.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									No diagnostics yet.
								</p>
							) : (
								diagnosticLogs.map((log) => (
									<div
										key={log.id}
										className={cn(
											"rounded-lg border px-3 py-2 text-xs",
											log.level === "error"
												? "border-destructive/30 bg-destructive/10 text-destructive"
												: log.level === "warning"
													? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
													: "border-border bg-background text-muted-foreground",
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium text-foreground">
												{log.message}
											</span>
											<span>{log.at}</span>
										</div>
										{log.detail ? (
											<pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
												{log.detail}
											</pre>
										) : null}
									</div>
								))
							)}
						</div>
					</div>
				</aside>
			</section>

			<RealtimeSettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				orbMode={orbMode}
				onOrbModeChange={(orbMode) =>
					setDisplaySettings((current) => ({
						...current,
						orbMode,
					}))
				}
				systemPrompt={displaySettings.systemPrompt ?? ""}
				defaultSystemPrompt={defaultSystemPrompt}
				onSystemPromptChange={(systemPrompt) =>
					setDisplaySettings((current) => ({
						...current,
						systemPrompt,
					}))
				}
			/>
			<audio ref={remoteAudioRef} autoPlay className="hidden" />
		</main>
	);
}

function RealtimeSettingsDialog({
	open,
	onOpenChange,
	orbMode,
	onOrbModeChange,
	systemPrompt,
	defaultSystemPrompt,
	onSystemPromptChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orbMode: RealtimeOrbMode;
	onOrbModeChange: (mode: RealtimeOrbMode) => void;
	systemPrompt: string;
	defaultSystemPrompt: string;
	onSystemPromptChange: (prompt: string) => void;
}) {
	const orbOptions: Array<{
		value: RealtimeOrbMode;
		label: string;
		description: string;
	}> = [
		{
			value: "simple",
			label: "Lightweight orb",
			description: "CSS-based status visual. Fastest default.",
		},
		{
			value: "persona",
			label: "Rich persona",
			description: "Rive/WebGL animation. Looks best, costs more.",
		},
		{
			value: "off",
			label: "Off",
			description: "No central visual.",
		},
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-h-[440px] md:max-w-[680px]">
				<DialogTitle className="sr-only">Realtime settings</DialogTitle>
				<DialogDescription className="sr-only">
					Realtime display and session settings.
				</DialogDescription>
				<div className="flex h-[440px] flex-1 overflow-hidden">
					<div className="hidden w-48 shrink-0 flex-col border-r border-border p-2 md:flex">
						<Button
							type="button"
							variant="secondary"
							className="w-full justify-start gap-2"
						>
							<Settings className="h-4 w-4" />
							Model
						</Button>
					</div>
					<div className="flex flex-1 flex-col overflow-hidden">
						<div className="border-b border-border px-4 py-3 md:hidden">
							<Button
								type="button"
								size="sm"
								variant="secondary"
								className="gap-2"
							>
								<Settings className="h-4 w-4" />
								Model
							</Button>
						</div>
						<div className="flex-1 overflow-y-auto p-4">
							<div className="grid gap-4">
								<div className="grid gap-1">
									<p className="text-sm font-semibold text-foreground">Model</p>
									<p className="text-xs text-muted-foreground">
										Applied when the next realtime session starts.
									</p>
								</div>
								<div className="grid gap-2 rounded-lg border border-border bg-background p-3">
									<div className="flex items-center justify-between gap-3">
										<Label htmlFor="realtime-system-prompt">System prompt</Label>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											onClick={() => onSystemPromptChange("")}
											disabled={!systemPrompt.trim()}
										>
											Reset
										</Button>
									</div>
									<Textarea
										id="realtime-system-prompt"
										value={systemPrompt}
										placeholder={defaultSystemPrompt}
										onChange={(event) => onSystemPromptChange(event.target.value)}
										className="min-h-28 resize-none text-sm"
									/>
									<p className="text-xs text-muted-foreground">
										{systemPrompt.trim() ? "Custom prompt" : defaultSystemPrompt}
									</p>
								</div>
								<div className="grid gap-1">
									<p className="text-sm font-semibold text-foreground">Display</p>
									<p className="text-xs text-muted-foreground">
										Stored locally for this browser.
									</p>
								</div>
								<div className="grid gap-2 rounded-lg border border-border bg-background p-3">
									<Label>Voice visual</Label>
									<div className="grid gap-2">
										{orbOptions.map((option) => (
											<button
												key={option.value}
												type="button"
												aria-pressed={orbMode === option.value}
												className={cn(
													"flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
													orbMode === option.value
														? "border-foreground/20 bg-muted"
														: "border-border hover:bg-muted/50",
												)}
												onClick={() => onOrbModeChange(option.value)}
											>
												<span className="grid gap-1">
													<span className="text-sm font-medium">{option.label}</span>
													<span className="text-xs leading-5 text-muted-foreground">
														{option.description}
													</span>
												</span>
												{orbMode === option.value ? (
													<Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
												) : (
													<span className="h-4 w-4 shrink-0" aria-hidden="true" />
												)}
											</button>
										))}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
