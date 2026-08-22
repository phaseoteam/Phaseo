/* eslint-disable max-lines -- pricing, comparison, and FAQ copy are intentionally reviewed together */
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Fragment } from "react";
import {
	ArrowRight,
	Calculator,
	Check,
	Coins,
	ExternalLink,
	KeyRound,
	Minus,
	ReceiptText,
	ShieldCheck,
	WalletCards,
	X,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { GATEWAY_TIERS } from "@/components/(gateway)/credits/tiers";
import { PricingComparisonShell } from "./PricingComparisonShell";
import { EnterprisePricingSection } from "./EnterprisePricingSection";

export const metadata: Metadata = buildMetadata({
	title: "Pricing",
	description:
		"Simple pay-as-you-go AI gateway pricing with optional self-serve Enterprise identity, governance, and included-payment plans.",
	path: "/pricing",
	keywords: [
		"AI gateway pricing",
		"API credit fees",
		"BYOK pricing",
		"pay as you go AI API",
		"AI gateway without contracts",
	],
});

type Cell =
	| { type: "included"; note?: string; inlineText?: string }
	| { type: "excluded"; note?: string; inlineText?: string }
	| { type: "not_applicable"; note?: string; inlineText?: string }
	| { type: "text"; value: string };

type MatrixRow = {
	feature: string;
	featureHref?: string;
	free: Cell;
	payg: Cell;
	enterprise?: Cell;
};

type MatrixSection = {
	id: string;
	title: string;
	rows: MatrixRow[];
};

type CompetitorKey = "openrouter" | "vercel" | "cloudflare" | "llmgateway";

type Competitor = {
	key: CompetitorKey;
	name: string;
	href: string;
	logoLight: string;
	logoDark?: string;
};

type ComparisonOption = "phaseo" | CompetitorKey;

type FAQItem = {
	id: string;
	question: string;
	answer: string;
};

type FAQSection = {
	id: string;
	title: string;
	items: FAQItem[];
};

function getTierByKey(key: "basic") {
	const tier = GATEWAY_TIERS.find((entry) => entry.key === key);
	if (!tier) throw new Error(`Missing required gateway tier: ${key}`);
	return tier;
}

function PlanCell({ cell, label }: { cell: Cell; label: string }) {
	if (cell.type === "text") {
		return (
			<div className="flex flex-col items-center justify-center gap-1.5 text-center">
				<span className="text-xs leading-4 text-muted-foreground">{cell.value}</span>
			</div>
		);
	}

	const included = cell.type === "included";
	const notApplicable = cell.type === "not_applicable";
	const statusLabel = included
		? "Included"
		: notApplicable
			? "Not applicable"
			: "Not included";
	const iconClass = included
		? "inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300"
		: notApplicable
			? "inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
			: "inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-300";
	const iconNode = (
		<span className={iconClass} aria-hidden="true">
			{included ? (
				<Check className="h-3.5 w-3.5" />
			) : notApplicable ? (
				<Minus className="h-3.5 w-3.5" />
			) : (
				<X className="h-3.5 w-3.5" />
			)}
		</span>
	);

	const inlineText = cell.inlineText ? (
		<span className="max-w-44 text-[11px] leading-4 text-muted-foreground">
			{cell.inlineText}
		</span>
	) : null;

	if (!cell.note) {
		return (
			<div className="flex flex-col items-center justify-center gap-1 text-center">
				{iconNode}
				<span className="sr-only">{`${label}: ${statusLabel}`}</span>
				{inlineText}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-1 text-center">
			<HoverCard openDelay={120}>
				<HoverCardTrigger asChild>
					<button
						type="button"
						className="rounded-full"
						aria-label={`${label}: ${statusLabel}. View details`}
					>
						{iconNode}
					</button>
				</HoverCardTrigger>
				<HoverCardContent className="w-64 text-xs leading-5">{cell.note}</HoverCardContent>
			</HoverCard>
			{inlineText}
		</div>
	);
}

const basicTier = getTierByKey("basic");
const BYOK_MONTHLY_FREE_REQUESTS = 1_000_000;
const BYOK_SERVICE_FEE_PERCENT = 2.5;

const COMPETITORS: Competitor[] = [
	{ key: "openrouter", name: "OpenRouter", href: "https://openrouter.ai/pricing", logoLight: "/logos/openrouter_light.svg", logoDark: "/logos/openrouter_dark.svg" },
	{ key: "vercel", name: "Vercel", href: "https://vercel.com/docs/ai-gateway/pricing", logoLight: "/logos/vercel_light.svg", logoDark: "/logos/vercel_dark.svg" },
	{ key: "cloudflare", name: "Cloudflare", href: "https://developers.cloudflare.com/ai-gateway/reference/pricing/", logoLight: "/logos/cloudflare.svg" },
	{ key: "llmgateway", name: "LLM Gateway", href: "https://llmgateway.io/pricing", logoLight: "/logos/llmgateway-light.svg", logoDark: "/logos/llmgateway-dark.svg" },
];

function ProviderLogo({ competitor }: { competitor: Competitor }) {
	return (
		<span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
			<Image src={competitor.logoLight} alt="" width={20} height={20} className={competitor.logoDark ? "h-5 w-5 object-contain dark:hidden" : "h-5 w-5 object-contain"} />
			{competitor.logoDark ? <Image src={competitor.logoDark} alt="" width={20} height={20} className="hidden h-5 w-5 object-contain dark:block" /> : null}
		</span>
	);
}

const included = (note?: string, inlineText?: string): Cell => ({ type: "included", note, inlineText });
const excluded = (inlineText = "Not advertised"): Cell => ({ type: "not_applicable", inlineText });
const textCell = (value: string): Cell => ({ type: "text", value });

const COMPETITOR_FEATURES: Record<string, Record<CompetitorKey, Cell>> = {
	"Gateway usage": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Credit purchase fee": {
		openrouter: textCell("5.5% ($0.80 minimum)"),
		vercel: textCell("0% gateway markup; payment processing fees may apply"),
		cloudflare: textCell("5% with Unified Billing"),
		llmgateway: textCell("5% (+1.5% non-US cards)"),
	},
	Models: {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	Providers: {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Gateway API access": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Responses API": {
		openrouter: included("OpenRouter documents a beta Responses API."),
		vercel: included("Vercel documents a dedicated Responses API."),
		cloudflare: included("Available through Cloudflare's OpenAI-compatible REST API."),
		llmgateway: included("Available at the OpenAI-compatible /v1/responses endpoint."),
	},
	"Chat Completions API": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Anthropic Messages API": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Text generation": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Image generation": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Video generation": {
		openrouter: included("Dedicated asynchronous video API."),
		vercel: included("Supported through the AI SDK video generation interface."),
		cloudflare: excluded(),
		llmgateway: included("Dedicated asynchronous video API."),
	},
	"Audio generation": {
		openrouter: included("Speech generation is publicly documented."),
		vercel: included("Speech and transcription are publicly documented."),
		cloudflare: included("TTS and ASR are available through /ai/run."),
		llmgateway: included("Speech generation is publicly documented."),
	},
	"Music generation": {
		openrouter: excluded(), vercel: excluded(), cloudflare: excluded(), llmgateway: excluded(),
	},
	Embeddings: {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Structured outputs and tool calling": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Built-in server tools": {
		openrouter: included("Includes provider and gateway server tools."),
		vercel: included("Includes provider tools and AI SDK tooling."),
		cloudflare: textCell("Provider dependent"),
		llmgateway: included("Includes web search and provider tools."),
	},
	"Request activity logs and export": {
		openrouter: included(),
		vercel: included(),
		cloudflare: included("Persistent logs are included. Logpush requires Workers Paid."),
		llmgateway: included(),
	},
	"Smart auto-routing": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Preferred provider selection": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Routing presets, fallbacks, and service tiers": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Response healing": {
		openrouter: included("Repairs malformed structured JSON on supported non-streaming requests."),
		vercel: excluded(), cloudflare: excluded(), llmgateway: excluded(),
	},
	Guardrails: {
		openrouter: included("Public guardrails include budgets, allowlists, ZDR, prompt-injection, and sensitive-data policies."),
		vercel: excluded(),
		cloudflare: included("Workers AI usage charges apply."),
		llmgateway: textCell("Enterprise feature"),
	},
	"Asynchronous jobs": {
		openrouter: textCell("Video jobs"), vercel: textCell("Video generation"), cloudflare: excluded(), llmgateway: textCell("Video jobs"),
	},
	"Batch API": {
		openrouter: excluded(), vercel: excluded(), cloudflare: excluded(), llmgateway: excluded(),
	},
	"Files API": {
		openrouter: included(), vercel: excluded(), cloudflare: excluded(), llmgateway: excluded(),
	},
	"Video generation API": {
		openrouter: included(), vercel: textCell("AI SDK interface"), cloudflare: excluded(), llmgateway: included(),
	},
	Webhooks: {
		openrouter: textCell("Video jobs"), vercel: excluded(), cloudflare: excluded(), llmgateway: textCell("Video jobs"),
	},
	"Budgets and spend controls": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Prompt caching": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Management API": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: textCell("Project APIs"),
	},
	"Team workspaces": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Payment method": {
		openrouter: textCell("Card, crypto, and more"),
		vercel: textCell("Card"),
		cloudflare: textCell("Cloudflare billing account"),
		llmgateway: textCell("Card; enterprise invoicing"),
	},
	"Billing method": {
		openrouter: textCell("Prepaid credits"),
		vercel: textCell("Credits or enterprise invoice"),
		cloudflare: textCell("BYOK or Unified Billing credits"),
		llmgateway: textCell("Credits, BYOK, or subscription"),
	},
	"Bring your own provider keys": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"BYOK service fee": {
		openrouter: textCell("1M requests/month free, then 5%"),
		vercel: textCell("No gateway markup"),
		cloudflare: textCell("No Unified Billing fee"),
		llmgateway: textCell("No fee"),
	},
	"Usage limits management": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Rate limits": {
		openrouter: textCell("50 free requests/day; high paid limits"),
		vercel: textCell("Gateway and provider limits"),
		cloudflare: textCell("200 requests/60 sec with Unified Billing"),
		llmgateway: textCell("No paid-model rate limit"),
	},
	Support: {
		openrouter: textCell("Community or email"),
		vercel: textCell("Docs and Vercel support"),
		cloudflare: textCell("Docs and community"),
		llmgateway: textCell("Community; SLA on enterprise"),
	},
	"Free model chat": {
		openrouter: included(), vercel: excluded("No hosted chat"), cloudflare: excluded("No hosted chat"), llmgateway: included(),
	},
	"Side-by-side model comparison": {
		openrouter: included(), vercel: excluded(), cloudflare: excluded(), llmgateway: textCell("Chat model selection"),
	},
	"Multimodal chat and parameter controls": {
		openrouter: included(), vercel: excluded("No hosted chat"), cloudflare: excluded("No hosted chat"), llmgateway: included(),
	},
	"Image, video, audio, and music studios": {
		openrouter: textCell("Model dependent"), vercel: excluded("No hosted studio"), cloudflare: excluded("No hosted studio"), llmgateway: included(),
	},
	"Realtime voice, speech, and transcription": {
		openrouter: textCell("Model dependent"), vercel: excluded("No hosted studio"), cloudflare: excluded("No hosted studio"), llmgateway: included(),
	},
	"Local chat history": {
		openrouter: included(), vercel: excluded("No hosted chat"), cloudflare: excluded("No hosted chat"), llmgateway: included(),
	},
	"Client SDKs": {
		openrouter: textCell("TypeScript, Python, Go"),
		vercel: textCell("TypeScript AI SDK; Python via compatible SDKs"),
		cloudflare: textCell("TypeScript Workers bindings; REST in any language"),
		llmgateway: textCell("TypeScript AI SDK provider; OpenAI-compatible SDKs"),
	},
	"Agent SDKs": {
		openrouter: textCell("TypeScript"),
		vercel: textCell("TypeScript AI SDK agent tooling"),
		cloudflare: textCell("TypeScript Agents SDK"),
		llmgateway: excluded(),
	},
	"Vercel AI SDK provider": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"OpenAI and Anthropic SDK compatibility": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Framework and coding assistant integrations": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Database usage": {
		openrouter: textCell("Model catalog"), vercel: textCell("Model catalog"), cloudflare: textCell("Model catalog"), llmgateway: textCell("Model catalog"),
	},
	"Public model and pricing data": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Public provider metadata": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Provider data explorer": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Token pricing visibility": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
	"Multimodal rankings": {
		openrouter: included("OpenRouter publishes rankings and usage-based model lists across multiple modalities.", "Text, image, audio, video + more"),
		vercel: included("Vercel AI Gateway leaderboards are filterable by modality.", "Text, image, video"),
		cloudflare: excluded(), llmgateway: excluded(),
	},
	"Benchmarks and performance comparisons": {
		openrouter: textCell("Provider performance data"), vercel: excluded(), cloudflare: excluded(), llmgateway: excluded(),
	},
	"Pricing calculator and request builder": {
		openrouter: textCell("Pricing data"), vercel: textCell("Model pricing"), cloudflare: textCell("Model pricing"), llmgateway: included(),
	},
	"Data API access": {
		openrouter: included(), vercel: included(), cloudflare: included(), llmgateway: included(),
	},
};

function getCompetitorCell(feature: string, competitor: CompetitorKey): Cell {
	return COMPETITOR_FEATURES[feature]?.[competitor] ?? excluded();
}

const BEST_BY_FEATURE: Partial<Record<string, ComparisonOption[]>> = {
	"Credit purchase fee": ["vercel"],
	"Payment method": ["openrouter"],
	"Billing method": ["phaseo", "openrouter", "vercel", "cloudflare", "llmgateway"],
	"BYOK service fee": ["vercel", "cloudflare", "llmgateway"],
	"Rate limits": ["phaseo", "llmgateway"],
	"Client SDKs": ["phaseo"],
	"Agent SDKs": ["phaseo"],
};

function isBestChoice(feature: string, option: ComparisonOption, cell: Cell): boolean {
	const explicitLeaders = BEST_BY_FEATURE[feature];
	if (explicitLeaders) return explicitLeaders.includes(option);
	return cell.type === "included";
}

const MATRIX_SECTIONS: MatrixSection[] = [
	{
		id: "gateway",
		title: "AI gateway",
		rows: [
			{
				feature: "Gateway usage",
				free: { type: "included", note: "Limited execution on supported free models" },
				payg: { type: "included", note: "Production execution traffic" },
			},
			{
				feature: "Credit purchase fee",
				free: { type: "not_applicable", inlineText: "No top-up required" },
				payg: { type: "text", value: `${basicTier.feePct.toFixed(0)}% ($1 minimum) when credits are purchased` },
				enterprise: { type: "text", value: "Core: 5%. Included Payments: fee-free allowance" },
			},
			{
				feature: "Models",
				featureHref: "/models",
				free: { type: "included", note: "Includes free models (count varies)" },
				payg: { type: "included", note: "Execute across gateway-enabled models" },
			},
			{
				feature: "Providers",
				featureHref: "/api-providers",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Gateway API access",
				free: { type: "included" },
				payg: { type: "included" },
			},
			...[
				"Responses API",
				"Chat Completions API",
				"Anthropic Messages API",
			].map((feature) => ({
				feature,
				free: included("Available where a supported free model route exists."),
				payg: included(),
			})),
			...[
				"Text generation",
				"Image generation",
				"Video generation",
				"Audio generation",
				"Music generation",
				"Embeddings",
			].map((feature) => ({
				feature,
				free: included("Available where a supported free model route exists."),
				payg: included("Support depends on the selected model and provider."),
			})),
			{
				feature: "Structured outputs and tool calling",
				free: { type: "included", note: "Model support varies." },
				payg: { type: "included", note: "Model support varies." },
			},
			{
				feature: "Built-in server tools",
				free: { type: "included", note: "The datetime tool is free. Metered tools require credits." },
				payg: { type: "included", inlineText: "Tool costs shown separately" },
			},
			{
				feature: "Request activity logs and export",
				free: { type: "included", note: "View logs only (no export)" },
				payg: { type: "included", note: "Operational logs with export" },
			},
			{
				feature: "Smart auto-routing",
				free: { type: "included", note: "Within the supported free model set" },
				payg: { type: "included" },
			},
			{
				feature: "Preferred provider selection",
				free: { type: "included", note: "Within the supported free model set" },
				payg: { type: "included" },
			},
			{
				feature: "Routing presets, fallbacks, and service tiers",
				free: { type: "included", note: "Routing is limited to supported free model routes." },
				payg: { type: "included" },
			},
			{
				feature: "Response healing",
				free: { type: "included", note: "Repairs supported structured responses." },
				payg: { type: "included", note: "Repairs supported structured responses." },
			},
			{
				feature: "Guardrails",
				free: { type: "included", note: "Any underlying model usage is billed normally." },
				payg: { type: "included", note: "Any underlying model usage is billed normally." },
			},
			...[
				"Asynchronous jobs",
				"Batch API",
				"Files API",
				"Video generation API",
				"Webhooks",
			].map((feature) => ({
				feature,
				free: included("Availability depends on the selected model and provider."),
				payg: included(),
			})),
			{
				feature: "Budgets and spend controls",
				free: { type: "not_applicable", note: "Not required for free-model usage" },
				payg: { type: "included" },
			},
			{
				feature: "Prompt caching",
				free: {
					type: "included",
					note: "Automatic only when a free model supports caching",
				},
				payg: { type: "included" },
			},
			{
				feature: "Management API",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Team workspaces",
				free: { type: "text", value: "Single team" },
				payg: { type: "included", inlineText: "Multi-team" },
				enterprise: { type: "included", inlineText: "Managed workspace controls" },
			},
			{
				feature: "Payment method",
				free: { type: "not_applicable", inlineText: "None required" },
				payg: { type: "text", value: "Credit or debit card" },
				enterprise: { type: "text", value: "Card and supported USD bank transfer" },
			},
			{
				feature: "Billing method",
				free: { type: "text", value: "No charge" },
				payg: { type: "text", value: "Prepaid credits" },
				enterprise: { type: "text", value: "Monthly subscription + prepaid credits" },
			},
			{
				feature: "Bring your own provider keys",
				free: { type: "included", note: "Add provider credentials and route through your own provider account." },
				payg: { type: "included", note: "Priority and fallback BYOK routing are included." },
			},
			{
				feature: "BYOK service fee",
				free: { type: "text", value: "1M requests/month free, then 2.5%" },
				payg: { type: "text", value: "1M requests/month free, then 2.5%" },
			},
			{
				feature: "Usage limits management",
				free: { type: "excluded" },
				payg: { type: "included" },
			},
			{
				feature: "Rate limits",
				free: {
					type: "included",
					inlineText: "No platform limits",
					note: "Upstream provider limits may still apply.",
				},
				payg: {
					type: "included",
					inlineText: "No platform limits",
					note: "Upstream provider limits may still apply.",
				},
			},
			{
				feature: "Support",
				free: { type: "included", inlineText: "Docs" },
				payg: { type: "included", inlineText: "Included" },
				enterprise: { type: "included", inlineText: "Priority support" },
			},
		],
	},
	{
		id: "enterprise-controls",
		title: "Enterprise identity and governance",
		rows: [
			{ feature: "SAML single sign-on", free: { type: "excluded" }, payg: { type: "excluded" }, enterprise: included("Configure a workspace identity provider without a sales-led setup.") },
			{ feature: "SCIM users, groups, and bulk operations", free: { type: "excluded" }, payg: { type: "excluded" }, enterprise: included("Provision users and organisational groups from a compatible identity provider.") },
			{ feature: "Departments and workspace roles", free: { type: "excluded" }, payg: { type: "excluded" }, enterprise: included("Keep member permissions separate from department structure.") },
			{ feature: "Enterprise audit and governance controls", free: { type: "excluded" }, payg: { type: "excluded" }, enterprise: included() },
			{ feature: "Included payment benefits", free: { type: "not_applicable" }, payg: { type: "excluded" }, enterprise: { type: "text", value: "Available with Included Payments" } },
		],
	},
	{
		id: "chat",
		title: "Chat and media studios",
		rows: [
			{
				feature: "Free model chat",
				featureHref: "/chat",
				free: { type: "included", note: "Chat with supported free model routes without a credit balance." },
				payg: { type: "included", note: "Use paid and free models from the same chat." },
			},
			{
				feature: "Side-by-side model comparison",
				featureHref: "/chat",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Multimodal chat and parameter controls",
				featureHref: "/chat",
				free: { type: "included", note: "Model capabilities vary." },
				payg: { type: "included", note: "Model capabilities vary." },
			},
			{
				feature: "Image, video, audio, and music studios",
				featureHref: "/chat/image",
				free: { type: "included", note: "Use a supported free route or BYOK. Your provider charges still apply with BYOK." },
				payg: { type: "included" },
			},
			{
				feature: "Realtime voice, speech, and transcription",
				featureHref: "/chat/realtime",
				free: { type: "included", note: "Use a supported free route or BYOK. Your provider charges still apply with BYOK." },
				payg: { type: "included" },
			},
			{
				feature: "Local chat history",
				free: { type: "included" },
				payg: { type: "included" },
			},
		],
	},
	{
		id: "sdks",
		title: "SDKs and integrations",
		rows: [
			{
				feature: "Client SDKs",
				featureHref: "https://phaseo.app/docs/v1/sdk-reference/typescript/overview",
				free: { type: "included", inlineText: "TypeScript, Python, Go, Java, C#, PHP, Ruby, Rust, C++" },
				payg: { type: "included", inlineText: "TypeScript, Python, Go, Java, C#, PHP, Ruby, Rust, C++" },
			},
			{
				feature: "Agent SDKs",
				featureHref: "https://phaseo.app/docs/v1/sdk-reference/typescript/agent-sdk-overview",
				free: { type: "included", inlineText: "TypeScript, Python, Go, C#, PHP, Ruby" },
				payg: { type: "included", inlineText: "TypeScript, Python, Go, C#, PHP, Ruby" },
			},
			{
				feature: "Vercel AI SDK provider",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "OpenAI and Anthropic SDK compatibility",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Framework and coding assistant integrations",
				featureHref: "/works-with",
				free: { type: "included" },
				payg: { type: "included" },
			},
		],
	},
	{
		id: "database",
		title: "Model data and discovery",
		rows: [
			{
				feature: "Database usage",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Public model and pricing data",
				featureHref: "/models",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Public provider metadata",
				featureHref: "/api-providers",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Provider data explorer",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Token pricing visibility",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Multimodal rankings",
				featureHref: "/rankings",
				free: { type: "included", inlineText: "Text, image, embeddings, rerank, audio, video, speech, transcription" },
				payg: { type: "included", inlineText: "Text, image, embeddings, rerank, audio, video, speech, transcription" },
			},
			{
				feature: "Benchmarks and performance comparisons",
				featureHref: "/benchmarks",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Pricing calculator and request builder",
				featureHref: "/tools/pricing-calculator",
				free: { type: "included" },
				payg: { type: "included" },
			},
			{
				feature: "Data API access",
				free: { type: "included" },
				payg: { type: "included" },
			},
		],
	},
];

const FAQ_SECTIONS: FAQSection[] = [
	{
		id: "billing-pricing",
		title: "Charges and Billing",
		items: [
			{
				id: "how-are-tokens-billed",
				question: "How is managed model usage billed?",
				answer:
					"Input, output, and other billable usage is deducted from your Phaseo credit balance at the model prices shown in the catalog. Phaseo does not add a separate markup to each managed request.",
			},
			{
				id: "what-does-phaseo-charge",
				question: "What does Phaseo charge?",
				answer:
					`For managed usage, Phaseo charges a ${basicTier.feePct.toFixed(0)}% fee, with a $1 minimum, when you purchase credits. For BYOK, the first ${BYOK_MONTHLY_FREE_REQUESTS.toLocaleString("en-US")} requests each UTC calendar month have no Phaseo service fee; after that, the fee is ${BYOK_SERVICE_FEE_PERCENT}% of the provider-equivalent cost.`,
			},
			{
				id: "is-top-up-fee-per-request",
				question: `Is the ${basicTier.feePct.toFixed(0)}% credit fee charged on every request?`,
				answer:
					`No. The ${basicTier.feePct.toFixed(0)}% fee, subject to a $1 minimum, is charged once when credits are purchased. Managed model usage then draws down those credits at the catalog price without another Phaseo request markup.`,
			},
			{
				id: "how-is-billing-structured",
				question: "How is billing structured?",
				answer:
					"Free access includes supported free models, public data, SDKs, and integrations. Paid model usage draws down prepaid credits. Teams that need SSO, SCIM, governance, or included payment benefits can add a separate monthly Enterprise subscription without changing how model usage is metered.",
			},
			{
				id: "are-sdks-priced-separately",
				question: "Do SDKs or integrations cost extra?",
				answer:
					"No. Phaseo client SDKs, Agent SDKs, compatibility layers, and documented integrations do not require a separate plan or subscription. Requests made through them follow the same managed usage or BYOK pricing shown on this page.",
			},
			{
				id: "enterprise-plan",
				question: "Do you offer an enterprise plan?",
				answer:
					"Yes. Enterprise Core and Included Payments are self-serve monthly workspace subscriptions with public seat-band pricing. Core includes identity and governance with the standard credit fee. Included Payments adds a monthly fee-free card allowance and no Phaseo surcharge on supported USD bank transfers.",
			},
			{
				id: "contracts-commitments",
				question: "Do I need a contract or monthly commitment?",
				answer:
					"Pay As You Go has no contract, subscription, or minimum monthly spend. Enterprise is an optional monthly subscription that can be activated self-serve; it does not require a negotiated enterprise agreement.",
			},
			{
				id: "are-failed-or-fallback-attempts-billed",
				question: "Are failed or fallback attempts billed?",
				answer:
					"Phaseo records managed charges for successful model usage. A failed attempt does not add a successful-usage charge. If a fallback provider completes the request, the usage served by that provider is billed normally. BYOK providers may apply their own billing rules to work processed before an error.",
			},
			{
				id: "streaming-pricing",
				question: "Are streaming responses billed differently?",
				answer:
					"No. Streaming changes how the response is delivered, not the Phaseo pricing model. The measured input, output, and other billable usage is charged at the same catalog price as a non-streaming request.",
			},
			{
				id: "data-api-free",
				question: "Is Data API access free?",
				answer:
					"Yes. Data API access is available to everyone. You do not need to purchase gateway credits to query public model, provider, pricing, benchmark, or ranking data.",
			},
			{
				id: "payment-methods",
				question: "What payment methods do you accept?",
				answer:
					"Phaseo accepts credit and debit cards for credit top-ups. Supported Enterprise Included Payments workspaces can also fund credits by USD bank transfer as that payment method is enabled for their Stripe customer. Credits remain the billing balance used for managed model usage.",
			},
			{
				id: "refunds",
				question: "Can I refund a credit purchase?",
				answer:
					"A credit purchase is eligible for a self-serve refund within 24 hours if none of the purchased credits have been used. You can review eligibility and request the refund from Settings → Credits.",
			},
			{
				id: "invoices",
				question: "Can I download an invoice?",
				answer:
					"Yes. PDF invoices are available for completed credit purchases from Settings → Credits. If an invoice is missing for a successful payment, contact support with the payment ID and date.",
			},
		],
	},
	{
		id: "byok",
		title: "Bring Your Own Key",
		items: [
			{
				id: "how-does-byok-work",
				question: "How is BYOK billed?",
				answer:
					`Your provider bills model usage directly to your provider account. Phaseo does not charge a service fee for your first ${BYOK_MONTHLY_FREE_REQUESTS.toLocaleString("en-US")} BYOK requests each UTC calendar month. After that allowance, Phaseo charges ${BYOK_SERVICE_FEE_PERCENT}% of the provider-equivalent cost.`,
			},
			{
				id: "what-is-included-with-byok",
				question: "What is included with BYOK?",
				answer:
					"Secure provider-key storage, gateway routing, request logs, provider selection, and priority or fallback key ordering are included. Provider-side quotas, negotiated rates, and billing remain attached to your provider account.",
			},
			{
				id: "provider-equivalent-cost",
				question: "What does provider-equivalent cost mean?",
				answer:
					"It is the catalog cost of the same model, provider route, and measured usage if Phaseo-managed credentials had served the request. After the monthly free allowance, the 2.5% BYOK service fee is calculated from that reference amount, not from the amount you top up or the balance in your provider account.",
			},
			{
				id: "can-i-control-byok-fallback",
				question: "Can I control when Phaseo uses my provider keys?",
				answer:
					"Yes. Priority keys are tried before Phaseo-managed providers. You can also enable fallback BYOK keys that are tried after managed providers.",
			},
		],
	},
	{
		id: "usage-controls",
		title: "Usage and Controls",
		items: [
			{
				id: "do-you-enforce-rate-limits",
				question: "Do you enforce platform rate limits?",
				answer:
					"No. Phaseo does not apply platform-level rate limits. Upstream providers may still apply their own limits.",
			},
			{
				id: "can-i-separate-environments",
				question: "Can I separate development, staging, and production?",
				answer:
					"Yes. Create separate API keys and policies for each environment so usage, controls, and logs remain isolated.",
			},
			{
				id: "can-i-set-budgets",
				question: "Can I set budgets and spend controls?",
				answer:
					"Yes. Pay As You Go includes API-key and team-level limits and spend controls. Free-model usage does not require spend controls.",
			},
		],
	},
	{
		id: "routing-reliability",
		title: "Routing and Reliability",
		items: [
			{
				id: "provider-unavailable",
				question: "What happens if a provider is unavailable?",
				answer:
					"Phaseo can retry or route to another provider that supports the selected model when a provider is rate-limited or returns an error. Presets, provider restrictions, and BYOK fallback settings determine which alternatives are available.",
			},
			{
				id: "routing-mode",
				question: "Can I optimise routing for price or latency?",
				answer:
					"Yes. Workspace routing modes can rank compatible providers by balanced performance, price, latency, or throughput. You can also use presets to restrict the provider set before routing begins.",
			},
			{
				id: "region-privacy-routing",
				question: "Can I restrict regions or require zero data retention?",
				answer:
					"Yes, when matching provider offers are available. Requests can specify required execution and data regions or require zero-data-retention support. Phaseo returns an error rather than silently using a route that does not meet those requirements.",
			},
			{
				id: "model-pricing-changes",
				question: "What happens when a model is deprecated or its price changes?",
				answer:
					"Phaseo tracks model lifecycle and provider availability in the catalog. Current catalog pricing is applied when a request is served. Use exact model IDs, availability data, and fallback presets when you need controlled migrations between model versions.",
			},
		],
	},
	{
		id: "apis-features",
		title: "APIs and Features",
		items: [
			{
				id: "openai-anthropic-migration",
				question: "Can I migrate from OpenAI, Anthropic, or another gateway?",
				answer:
					"Yes. Phaseo provides OpenAI-compatible Chat Completions and Responses APIs, an Anthropic-compatible Messages API, SDK compatibility, and migration guides. Most integrations begin by changing the base URL, API key, and model ID.",
			},
			{
				id: "tools-structured-output",
				question: "Do you support tools and structured output?",
				answer:
					"Yes. Tool calling, structured-output schemas, server tools, and optional response healing are available where the selected model and endpoint support them. Model capability data is available through the catalog and Data API.",
			},
			{
				id: "multimodal-endpoints",
				question: "Which modalities can I use?",
				answer:
					"Phaseo supports text, image, video, audio, speech, transcription, music, embeddings, moderation, reranking, OCR, and realtime workflows across supported models and providers. Availability and billing units vary by model.",
			},
		],
	},
	{
		id: "privacy-data",
		title: "Privacy and Data",
		items: [
			{
				id: "training-data",
				question: "Does Phaseo train on my prompts or responses?",
				answer:
					"No. Phaseo does not use gateway prompts or responses to train its own models. Requests are sent to the provider that serves them, so that provider's data and training policies still apply unless your routing requirements exclude that provider.",
			},
			{
				id: "request-logging",
				question: "What request data does Phaseo store?",
				answer:
					"Phaseo stores operational and billing metadata such as model, provider, token counts, latency, and errors. Raw prompts and responses are not persistently stored by default. If workspace I/O logging is enabled, payload retention follows the workspace privacy and retention settings.",
			},
		],
	},
	{
		id: "support-status",
		title: "Support and Status",
		items: [
			{
				id: "service-status",
				question: "Where can I check incidents and uptime?",
				answer:
					"Current service status and incident history are published at status.phaseo.app. Request IDs and activity logs can help support trace a specific failure.",
			},
			{
				id: "contact-support",
				question: "How do I contact support?",
				answer:
					"Use the contact page or email support@phaseo.app for account, billing, and technical questions. Bug reports and feature requests can also be filed through the public GitHub repository.",
			},
		],
	},
];

export default function PricingPage() {
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
				<section className="space-y-7">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						Pay as you go by default. Add Enterprise when your team needs it.
					</h1>
					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						Buy credits when you need them and pay for what you use. Enterprise identity and payment benefits are optional, priced openly, and activated without a sales call. For model-level cost estimates, use the{" "}
						<Link className="underline underline-offset-4" href="/tools/pricing-calculator">
							Pricing Calculator
						</Link>
						{" "}and review{" "}
						<Link
							className="underline underline-offset-4"
							href="/how-phaseo-calculates-model-pricing"
						>
							how Phaseo calculates model pricing
						</Link>
						.
					</p>
					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/settings/credits">
								Manage Credits
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="/settings/byok">
								Manage Provider Keys
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10">
							<Link href="/tools/pricing-calculator">
								<Calculator className="mr-2 h-4 w-4" />
								Model Pricing Calculator
							</Link>
						</Button>
					</div>
					<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 sm:grid-cols-3 sm:divide-x sm:divide-zinc-200/80 sm:dark:divide-zinc-800/80">
						{[
							{
								icon: WalletCards,
								title: "Pay as you go",
								body: "Top up credits only when you need them.",
							},
							{
								icon: ShieldCheck,
								title: "Enterprise is optional",
								body: "Add SSO, SCIM and governance without changing usage pricing.",
							},
							{
								icon: ReceiptText,
								title: "Prices stay public",
								body: "Answer a short questionnaire and subscribe immediately.",
							},
						].map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.title} className="flex gap-3 py-5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
									<Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
									<div>
										<p className="text-sm font-semibold text-foreground">{item.title}</p>
										<p className="mt-1 text-sm leading-5 text-muted-foreground">{item.body}</p>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-5">
					<div className="max-w-3xl">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							What Phaseo charges
						</h2>
						<p className="mt-2 text-sm leading-6 text-muted-foreground">
							Model usage and Phaseo fees are shown separately so you can see what is charged, by whom, and when.
						</p>
					</div>
					<dl className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 lg:grid-cols-3 lg:divide-x lg:divide-zinc-200/80 lg:dark:divide-zinc-800/80">
						{[
							{
								icon: Coins,
								term: "Managed model usage",
								value: "Catalog model price",
								detail: "Deducted from your prepaid credits after successful usage. No additional Phaseo request markup.",
							},
							{
								icon: ReceiptText,
								term: "Credit purchase",
								value: `${basicTier.feePct.toFixed(0)}% top-up fee ($1 minimum)`,
								detail: "Charged when you purchase credits. It is not charged again for each managed request.",
							},
							{
								icon: KeyRound,
								term: "Bring Your Own Key",
								value: `${BYOK_MONTHLY_FREE_REQUESTS.toLocaleString("en-US")} requests free, then ${BYOK_SERVICE_FEE_PERCENT}%`,
								detail: "Your provider bills model usage directly. The allowance resets at the start of each UTC month; the Phaseo fee after that is based on provider-equivalent cost.",
							},
						].map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.term} className="flex gap-4 py-5 lg:px-6 lg:first:pl-0 lg:last:pr-0">
									<Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
									<div>
										<dt className="text-sm font-semibold text-foreground">{item.term}</dt>
										<dd className="mt-2 text-sm leading-6 text-muted-foreground">
											<span className="font-medium text-foreground">{item.value}.</span>{" "}
											{item.detail}
										</dd>
									</div>
								</div>
							);
						})}
					</dl>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-6">
					<PricingComparisonShell>
						<table className="w-full min-w-[940px] table-fixed text-left text-sm">
							<colgroup>
								<col className="feature-column w-[28%]" />
								<col className="free-column w-[24%]" />
								<col className="phaseo-column w-[24%]" />
								<col className="enterprise-column w-[24%]" />
								{COMPETITORS.map((competitor) => <col key={competitor.key} className="competitor-col hidden w-[16%]" />)}
							</colgroup>
							<thead className="border-b border-zinc-200/70 bg-zinc-50/80 dark:border-zinc-800/70 dark:bg-zinc-900/60">
								<tr>
									<th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Feature</th>
									<th className="free-column px-4 py-3 text-center font-medium text-zinc-700 dark:text-zinc-300">Free access</th>
									<th className="px-4 py-3 text-center font-bold text-foreground">
										<span className="phaseo-default">Pay As You Go</span>
										<span className="phaseo-compare hidden">
											<span className="inline-flex items-center justify-center gap-2">
												<Image src="/logo_light.svg" alt="" width={20} height={20} className="h-5 w-5 dark:hidden" />
												<Image src="/logo_dark.svg" alt="" width={20} height={20} className="hidden h-5 w-5 dark:block" />
												Phaseo
											</span>
										</span>
									</th>
									<th className="enterprise-column px-4 py-3 text-center font-bold text-foreground">Enterprise</th>
									{COMPETITORS.map((competitor) => (
										<th key={competitor.key} className="competitor-cell hidden px-4 py-3 text-center font-semibold text-foreground">
											<a href={competitor.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline decoration-transparent underline-offset-4 hover:decoration-current">
												<ProviderLogo competitor={competitor} />
												{competitor.name}
												<ExternalLink className="h-3 w-3" aria-hidden="true" />
											</a>
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
								{MATRIX_SECTIONS.map((section) => (
									<Fragment key={section.id}>
										<tr
											className="bg-zinc-50/70 dark:bg-zinc-900/40"
										>
											<td
												colSpan={4 + COMPETITORS.length}
												className="px-4 py-3 text-base font-semibold text-foreground"
											>
												{section.title}
											</td>
										</tr>
										{section.rows.map((row) => (
											<tr key={`${section.id}-${row.feature}`} className="h-[72px]">
												<td className="px-4 py-3 align-middle text-foreground font-medium">
													{row.featureHref ? (
														<Link
															href={row.featureHref}
															className="underline decoration-transparent underline-offset-4 hover:decoration-current"
														>
															{row.feature}
														</Link>
													) : (
														row.feature
													)}
												</td>
										<td className="free-column px-4 py-3 align-middle text-center"><PlanCell cell={row.free} label={`${row.feature}, Free access`} /></td>
										<td className={`${isBestChoice(row.feature, "phaseo", row.payg) ? "best-cell " : ""}px-4 py-3 align-middle text-center`}>
											<PlanCell cell={row.payg} label={`${row.feature}, Pay As You Go`} />
										</td>
										<td className="enterprise-column px-4 py-3 align-middle text-center">
											<PlanCell cell={row.enterprise ?? row.payg} label={`${row.feature}, Enterprise`} />
										</td>
										{COMPETITORS.map((competitor) => (
											<td key={competitor.key} className={`${isBestChoice(row.feature, competitor.key, getCompetitorCell(row.feature, competitor.key)) ? "best-cell " : ""}competitor-cell hidden px-4 py-3 align-middle text-center`}>
												<PlanCell cell={getCompetitorCell(row.feature, competitor.key)} label={`${row.feature}, ${competitor.name}`} />
											</td>
										))}
											</tr>
										))}
									</Fragment>
								))}
							</tbody>
						</table>
					</PricingComparisonShell>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<EnterprisePricingSection />

				<section className="space-y-6 py-10 sm:py-12">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							Frequently Asked Questions
						</h2>
					</div>
					<div className="space-y-8">
						{FAQ_SECTIONS.map((section) => (
							<div key={section.id} className="space-y-2">
								<h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
									{section.title}
								</h3>
								<Accordion type="single" collapsible>
									{section.items.map((item) => (
										<AccordionItem key={item.id} value={`${section.id}-${item.id}`}>
											<AccordionTrigger>{item.question}</AccordionTrigger>
											<AccordionContent className="text-muted-foreground leading-6">
												{item.answer}
											</AccordionContent>
										</AccordionItem>
									))}
								</Accordion>
							</div>
						))}
					</div>
				</section>

				<section>
					<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardHeader className="space-y-2">
							<CardTitle className="text-2xl tracking-tight">Ready to get started?</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								Start free, add credits when you need them, and keep the same pay-as-you-go terms as you grow.
							</p>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
							<Button asChild className="h-10 rounded-xl">
								<Link href="/">
									Open Platform
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="h-10 rounded-xl">
								<Link href="mailto:support@phaseo.app">
									Ask a pricing question
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}
