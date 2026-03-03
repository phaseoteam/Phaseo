import Link from "next/link";
import type { Metadata } from "next";
import { Fragment } from "react";
import { ArrowRight, BadgeDollarSign, Calculator, Check, Minus, X } from "lucide-react";
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

export const metadata: Metadata = buildMetadata({
	title: "AI Stats Pricing",
	description:
		"AI Stats Gateway pricing matrix for Free, Pay As You Go, and Enterprise plans, including capabilities, controls, and support.",
	path: "/pricing",
	keywords: [
		"AI Stats pricing",
		"gateway pricing",
		"free pay as you go enterprise",
		"pricing matrix",
		"api gateway plans",
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
	enterprise: Cell;
};

type MatrixSection = {
	id: string;
	title: string;
	rows: MatrixRow[];
};

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

function getTierByKey(key: "basic" | "enterprise") {
	const tier = GATEWAY_TIERS.find((entry) => entry.key === key);
	if (!tier) throw new Error(`Missing required gateway tier: ${key}`);
	return tier;
}

function PlanCell({ cell }: { cell: Cell }) {
	if (cell.type === "text") {
		return <span className="text-xs text-muted-foreground">{cell.value}</span>;
	}

	const included = cell.type === "included";
	const notApplicable = cell.type === "not_applicable";
	const iconClass = included
		? "inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300"
		: notApplicable
			? "inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
			: "inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-300";
	const iconNode = (
		<span className={iconClass}>
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
		<span className="max-w-28 text-[11px] leading-4 text-muted-foreground">
			{cell.inlineText}
		</span>
	) : null;

	if (!cell.note) {
		return (
			<div className="flex flex-col items-center justify-center gap-1 text-center">
				{iconNode}
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
						aria-label="View plan details"
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
const enterpriseTier = getTierByKey("enterprise");
const SHOW_ENTERPRISE_PREVIEW_ROWS = false;
const ENTERPRISE_PREVIEW_ROWS: MatrixRow[] = [
	{
		feature: "Data policy routing",
		free: { type: "excluded" },
		payg: { type: "excluded" },
		enterprise: { type: "included" },
	},
	{
		feature: "Management policy enforcement",
		free: { type: "excluded" },
		payg: { type: "excluded" },
		enterprise: { type: "included" },
	},
	{
		feature: "SSO / SAML",
		free: { type: "excluded" },
		payg: { type: "excluded" },
		enterprise: { type: "included" },
	},
	{
		feature: "Contractual SLAs",
		free: { type: "excluded" },
		payg: { type: "excluded" },
		enterprise: { type: "included" },
	},
];

const MATRIX_SECTIONS: MatrixSection[] = [
	{
		id: "gateway",
		title: "Gateway",
		rows: [
			{
				feature: "Gateway usage",
				free: { type: "included", note: "Limited execution on supported free models" },
				payg: { type: "included", note: "Production execution traffic" },
				enterprise: { type: "included", note: "Production + governance workflows" },
			},
			{
				feature: "Credit purchase fee",
				free: { type: "text", value: "0% (no top-up required)" },
				payg: { type: "text", value: `${basicTier.feePct.toFixed(1)}% on credit purchases` },
				enterprise: {
					type: "text",
					value: `${enterpriseTier.feePct.toFixed(1)}% on credit purchases`,
				},
			},
			{
				feature: "Models",
				featureHref: "/models",
				free: { type: "included", note: "Includes free models (count varies)" },
				payg: { type: "included", note: "Execute across gateway-enabled models" },
				enterprise: { type: "included", note: "Enterprise governance on model execution" },
			},
			{
				feature: "Providers",
				featureHref: "/api-providers",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Gateway API access",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Request activity logs and export",
				free: { type: "included", note: "View logs only (no export)" },
				payg: { type: "included", note: "Operational logs with export" },
				enterprise: { type: "included", note: "Extended audit and retention workflows" },
			},
			{
				feature: "Smart auto-routing",
				free: { type: "included", note: "Within the supported free model set" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Preferred provider selection",
				free: { type: "included", note: "Within the supported free model set" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Budgets and spend controls",
				free: { type: "not_applicable", note: "Not required for free-model usage" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Prompt caching",
				free: {
					type: "included",
					note: "Automatic only when a free model supports caching",
				},
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Management API",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Team workspaces",
				free: { type: "excluded", inlineText: "Single team" },
				payg: { type: "included", inlineText: "Multi-team" },
				enterprise: { type: "included", inlineText: "Org scale" },
			},
			...(SHOW_ENTERPRISE_PREVIEW_ROWS ? ENTERPRISE_PREVIEW_ROWS : []),
			{
				feature: "Payment options",
				free: { type: "excluded", inlineText: "No billing" },
				payg: { type: "included", inlineText: "Card / credits" },
				enterprise: { type: "included", inlineText: "Card or invoice" },
			},
			{
				feature: "BYOK limits",
				free: { type: "excluded" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Usage limits management",
				free: { type: "excluded" },
				payg: { type: "included" },
				enterprise: { type: "included" },
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
				enterprise: {
					type: "included",
					inlineText: "No platform limits",
					note: "Upstream provider limits may still apply.",
				},
			},
			{
				feature: "Pricing support",
				free: { type: "included", inlineText: "Docs" },
				payg: { type: "included", inlineText: "Standard" },
				enterprise: { type: "included", inlineText: "Priority" },
			},
		],
	},
	{
		id: "database",
		title: "Database",
		rows: [
			{
				feature: "Database usage",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Public model and pricing data",
				featureHref: "/models",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Public provider metadata",
				featureHref: "/api-providers",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Provider data explorer",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Token pricing visibility",
				free: { type: "included" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
			{
				feature: "Data API access",
				free: { type: "excluded" },
				payg: { type: "included" },
				enterprise: { type: "included" },
			},
		],
	},
];

const FAQ_SECTIONS: FAQSection[] = [
	{
		id: "billing-pricing",
		title: "Billing and Pricing",
		items: [
			{
				id: "how-are-tokens-billed",
				question: "How are tokens billed?",
				answer:
					"Input and output usage consumes credits at the model prices shown in the catalog. The only extra platform fee is charged when credits are purchased (top-up fee), not on each token request.",
			},
			{
				id: "do-you-mark-up-provider-pricing",
				question: "Do you mark up provider pricing?",
				answer:
					"We do not add an extra per-request markup. Fees are only applied at credit purchase time by plan.",
			},
			{
				id: "how-is-billing-structured",
				question: "How is billing structured for Free, Pay As You Go, and Enterprise?",
				answer:
					"Free includes limited execution on supported free models and public data access. Pay As You Go uses a top-up system where you deposit credits and draw from that balance for usage. Enterprise can use the same credit model or move to invoicing after contacting us.",
			},
			{
				id: "are-failed-or-fallback-attempts-billed",
				question: "Are failed or fallback attempts billed?",
				answer:
					"Billing tracks successful model usage. Failed attempts do not add successful usage charges in normal Gateway accounting.",
			},
			{
				id: "payment-methods",
				question: "What payment methods do you accept?",
				answer:
					"Pay As You Go supports card payments and credit top-ups. Enterprise can be configured for card or invoice-based billing.",
			},
		],
	},
	{
		id: "usage-rate-limits",
		title: "Usage and Rate Limits",
		items: [
			{
				id: "do-you-enforce-rate-limits",
				question: "Do you enforce platform rate limits?",
				answer:
					"No. AI Stats does not apply platform-level rate limits across plans. Upstream providers may apply limits, and we actively work with providers to secure the highest practical limits for customers.",
			},
			{
				id: "can-i-separate-environments",
				question: "Can I separate environments (dev, staging, production)?",
				answer:
					"Yes. Create separate API keys and policies per environment so usage, controls, and logs remain isolated.",
			},
			{
				id: "can-i-set-budgets",
				question: "Can I set budgets and spend controls?",
				answer:
					"Yes for paid execution workflows. Free-model usage does not require spend controls, while paid plans can use limits and team-level controls.",
			},
		],
	},
	{
		id: "routing-latency",
		title: "Routing and Latency",
		items: [
			{
				id: "does-routing-affect-latency",
				question: "Does routing affect latency?",
				answer:
					"We continuously optimize routing to minimize added latency while maintaining secure, reliable request completion, but end-to-end latency can still vary by provider, model, and network conditions.",
			},
			{
				id: "what-happens-deprecated-model",
				question: "What happens if a model is deprecated?",
				answer:
					"We aim to give as much advance notice as possible for deprecations or retirements, including clear upgrade alternatives, and if a model is no longer routable the API returns a model availability error.",
			},
			{
				id: "can-i-pin-model-versions",
				question: "Can I pin specific model IDs or versions?",
				answer:
					"Yes. We aim to make model snapshots clear and accessible across the platform, and explicit model IDs let you pin a specific version for as long as that snapshot remains available.",
			},
		],
	},
	{
		id: "privacy-security",
		title: "Privacy and Security",
		items: [
			{
				id: "do-you-train-on-data",
				question: "Do you train on customer data?",
				answer:
					"No. AI Stats does not use customer prompts or outputs to train foundation models.",
			},
			{
				id: "how-does-byok-work",
				question: "How does BYOK work?",
				answer:
					"With BYOK, requests are routed using your provider credentials so usage and provider-side controls remain tied to your provider account.",
			},
			{
				id: "do-you-support-sso",
				question: "Do you support SSO (SAML)?",
				answer:
					"SSO/SAML is currently an enterprise roadmap capability and is being rolled out in limited stages.",
			},
		],
	},
	{
		id: "models-features",
		title: "Models and Features",
		items: [
			{
				id: "how-to-migrate",
				question: "How do I migrate from OpenAI or Anthropic?",
				answer:
					"The Gateway is OpenAI-compatible for most integrations. In most cases, you update the base URL, API key, and model IDs.",
			},
			{
				id: "function-calling-support",
				question: "Do you support tools and function calling?",
				answer:
					"Yes, when the selected upstream model supports those capabilities.",
			},
			{
				id: "free-plan-model-access",
				question: "What model access is included in Free?",
				answer:
					"Free includes a limited set of supported free models, while paid plans unlock broader execution and control options.",
			},
		],
	},
	{
		id: "reliability-uptime",
		title: "Reliability and Uptime",
		items: [
			{
				id: "provider-down",
				question: "What happens if a provider is down or returns errors?",
				answer:
					"Gateway routing and fallback can shift traffic to alternative providers that support your selected model.",
			},
			{
				id: "where-check-incidents",
				question: "Where can I check incidents and service health?",
				answer:
					"Operational updates are shared through support and release communications while broader status reporting is expanded.",
			},
		],
	},
];

export default function PricingPage() {
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
				<section className="space-y-6">
					<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white/70 px-3 py-1 text-xs text-muted-foreground dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<BadgeDollarSign className="h-3.5 w-3.5" />
						Gateway Pricing
					</div>
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						AI Stats Gateway pricing matrix.
					</h1>
					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						This page focuses on Gateway plans and capabilities. For model-level token and request cost estimation, use the{" "}
						<Link className="underline underline-offset-4" href="/tools/pricing-calculator">
							Pricing Calculator
						</Link>
						.
					</p>
					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/settings/tiers">
								View Your Tier
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="/settings/credits">
								Manage Credits
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
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-6">
					<div className="overflow-x-auto rounded-xl border border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<table className="w-full min-w-[1160px] table-fixed text-left text-sm">
							<colgroup>
								<col className="w-[40%]" />
								<col className="w-[20%]" />
								<col className="w-[20%]" />
								<col className="w-[20%]" />
							</colgroup>
							<thead className="border-b border-zinc-200/70 bg-zinc-50/80 dark:border-zinc-800/70 dark:bg-zinc-900/60">
								<tr>
									<th className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Feature</th>
									<th className="px-4 py-3 text-center font-medium text-zinc-700 dark:text-zinc-300">Free</th>
									<th className="px-4 py-3 text-center font-bold text-foreground">Pay As You Go</th>
									<th className="px-4 py-3 text-center font-medium text-zinc-700 dark:text-zinc-300">Enterprise</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
								{MATRIX_SECTIONS.map((section) => (
									<Fragment key={section.id}>
										<tr
											className="bg-zinc-50/70 dark:bg-zinc-900/40"
										>
											<td
												colSpan={4}
												className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
											>
												{section.title}
											</td>
										</tr>
										{section.rows.map((row) => (
											<tr key={`${section.id}-${row.feature}`}>
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
												<td className="px-4 py-3 align-top text-center"><PlanCell cell={row.free} /></td>
												<td className="px-4 py-3 align-top text-center"><PlanCell cell={row.payg} /></td>
												<td className="px-4 py-3 align-top text-center"><PlanCell cell={row.enterprise} /></td>
											</tr>
										))}
									</Fragment>
								))}
							</tbody>
						</table>
					</div>
				</section>

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
								Start with Pay As You Go and upgrade automatically as your usage grows.
							</p>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
							<Button asChild className="h-10">
								<Link href="/gateway">
									Open Gateway
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" className="h-10">
								<Link href="/contact">
									Talk to sales
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
