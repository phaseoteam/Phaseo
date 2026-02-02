"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FAQItemProps {
	question: string;
	answer: string;
	isOpen: boolean;
	onToggle: () => void;
}

function FAQItem({ question, answer, isOpen, onToggle }: FAQItemProps) {
	return (
		<div
			className={cn(
				"group overflow-hidden rounded-xl border transition-all duration-300",
				isOpen
					? "border-slate-300 bg-white shadow-sm"
					: "border-slate-200/60 bg-white/80 hover:border-slate-300/80 hover:bg-white",
			)}
		>
			<button
				onClick={onToggle}
				type="button"
				className="flex w-full items-start justify-between gap-4 p-5 text-left"
			>
				<span
					className={cn(
						"text-base font-medium transition-colors",
						isOpen ? "text-slate-900" : "text-slate-700",
					)}
				>
					{question}
				</span>
				<ChevronDown
					className={cn(
						"mt-0.5 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300",
						isOpen && "rotate-180 text-slate-600",
					)}
				/>
			</button>
			<div
				className={cn(
					"grid transition-all duration-300",
					isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="overflow-hidden">
					<div className="border-t border-slate-100 px-5 pb-5 pt-4">
						<p className="text-sm leading-relaxed text-slate-600">
							{answer}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

const FAQ_ITEMS = [
	{
		question: "Can I use my own provider API keys?",
		answer: "Yes — bring your own keys (BYOK) for any provider and enforce limits per key. Your keys are encrypted at rest and never logged. Managed keys are also available if you prefer not to handle credentials yourself.",
	},
	{
		question: "What model modalities does the Gateway support?",
		answer: "We support chat completions, embeddings, moderations, image generation, audio generation, and video generation — each with consistent schemas across all providers. All modalities are first-class citizens with full routing and observability support.",
	},
	{
		question: "How quickly are new models added?",
		answer: "New provider models and community submissions are reviewed and added on a rolling basis — typically within 24-48 hours of release. Once approved, they're available instantly in the Gateway and the SDKs with no code changes required.",
	},
	{
		question: "Where do latency and reliability metrics come from?",
		answer: "All telemetry comes from live Gateway traffic. The dashboards display real-world token usage, latency percentiles, and provider health scores. This data feeds directly into our intelligent routing algorithms.",
	},
	{
		question: "Can I mix different providers in one application?",
		answer: "Absolutely — choose the provider or model per request while keeping a single unified API. Switching providers requires only changing the model name. You can even set up automatic fallbacks between providers.",
	},
	{
		question: "How does intelligent routing work?",
		answer: "Routing is evaluated on a request-by-request basis using real-time provider health, latency metrics, and your configured policies. You can route by lowest latency, lowest cost, specific regions, or custom rules. Circuit breakers automatically redirect traffic away from degraded providers.",
	},
	{
		question: "Does AI Stats apply any rate limits?",
		answer: "No — we don't impose rate limits. Upstream providers may have their own limits, but we work with providers to optimize your allocation. You can optionally set spend limits per API key to control costs.",
	},
	{
		question: "What security certifications do you have?",
		answer: "We follow industry best practices for data protection. All data is encrypted in transit and at rest. We support SSO, audit logging, and fine-grained access controls for enterprise deployments.",
	},
];

export function FAQSection() {
	const [openIndex, setOpenIndex] = useState<number | null>(0);

	const handleToggle = (index: number) => {
		setOpenIndex(openIndex === index ? null : index);
	};

	const midPoint = Math.ceil(FAQ_ITEMS.length / 2);
	const leftColumn = FAQ_ITEMS.slice(0, midPoint);
	const rightColumn = FAQ_ITEMS.slice(midPoint);

	return (
		<section className="relative overflow-hidden py-20 sm:py-28">
			<div className="relative mx-auto max-w-7xl px-6 lg:px-8">
				{/* Section header */}
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="secondary"
						className="mb-4 border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600"
					>
						<HelpCircle className="mr-1.5 h-3.5 w-3.5" />
						FAQ
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
						Frequently asked questions
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-slate-600">
						Everything you need to know about the AI Stats Gateway.
						Can't find an answer?{" "}
						<a
							href="mailto:support@ai-stats.phaseo.app"
							className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
						>
							Reach out to our team
						</a>
						.
					</p>
				</div>

				{/* FAQ grid */}
				<div className="mt-16 grid gap-4 lg:grid-cols-2">
					<div className="space-y-4">
						{leftColumn.map((item, index) => (
							<FAQItem
								key={item.question}
								question={item.question}
								answer={item.answer}
								isOpen={openIndex === index}
								onToggle={() => handleToggle(index)}
							/>
						))}
					</div>
					<div className="space-y-4">
						{rightColumn.map((item, index) => {
							const actualIndex = index + midPoint;
							return (
								<FAQItem
									key={item.question}
									question={item.question}
									answer={item.answer}
									isOpen={openIndex === actualIndex}
									onToggle={() => handleToggle(actualIndex)}
								/>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}
