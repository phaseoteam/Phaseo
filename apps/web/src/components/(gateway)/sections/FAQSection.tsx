"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
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
					? "border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
					: "border-zinc-200/60 bg-white/80 hover:border-zinc-300/80 hover:bg-white dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70",
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
						isOpen
							? "text-zinc-900 dark:text-zinc-100"
							: "text-zinc-700 dark:text-zinc-200",
					)}
				>
					{question}
				</span>
				<ChevronDown
					className={cn(
						"mt-0.5 h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-300",
						isOpen && "rotate-180 text-zinc-600 dark:text-zinc-300",
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
					<div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">
						<p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
							{answer}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

export const FAQ_ITEMS = [
	{
		question: "Why should I use AI Stats Gateway?",
		answer: "AI Stats gives you one OpenAI-compatible surface for model routing, provider failover, pricing context, and observability. The point is not just access to more models. It is being able to swap providers, compare real costs, and keep production traffic stable without rebuilding your integration every time the market moves.",
	},
	{
		question: "How do I get started?",
		answer: "Create an account, add credits if you want managed billing, generate an API key, and point your existing OpenAI-compatible client at AI Stats Gateway. If you already have provider keys, you can also bring your own keys and keep your provider billing directly under your control.",
	},
	{
		question: "How do billing and fees work?",
		answer: "Managed usage is billed from your AI Stats credits using the model and provider pricing shown in the catalog. If you bring your own provider keys, the upstream inference cost stays with that provider and AI Stats only applies the documented gateway fee where relevant. The goal is that pricing stays inspectable rather than hidden behind blended markups.",
	},
	{
		question: "Can I use my own provider API keys?",
		answer: "Yes. BYOK is a first-class path. You can attach your own provider credentials, keep provider-side billing under your control, and still use the same routing, health, and policy layer on top.",
	},
	{
		question: "What models and modalities do you support?",
		answer: "The database and gateway cover chat, embeddings, image, audio, video, moderation, and related model capabilities across a large provider set. Support is surfaced per provider and per model, so you can see exactly what is available before routing production traffic.",
	},
	{
		question: "How quickly are new models added?",
		answer: "New models are added on a rolling basis as providers release them and as we verify pricing, capabilities, and metadata. High-interest frontier releases are usually prioritised quickly, but accuracy beats rushing incomplete catalog rows into production.",
	},
	{
		question: "How does provider fallback work?",
		answer: "Routing decisions are made request by request using provider health, latency, cost, capability, and your policies. If a provider degrades or errors, AI Stats can fall through to the next eligible provider without requiring a new client integration or a manual operational response.",
	},
	{
		question: "What SDK and API formats are supported?",
		answer: "AI Stats is designed around an OpenAI-compatible request shape, so existing OpenAI-style SDKs and tools can usually be moved across with minimal changes. On top of that, we publish our own SDKs and provider adapters where teams want stronger typing or more direct gateway features.",
	},
	{
		question: "What data is logged during API use?",
		answer: "We log the operational metadata needed to route, audit, and bill requests correctly. Prompt or completion logging should never be treated as implicit. Where logging behaviour is configurable, it should be explicit and visible in the product rather than assumed.",
	},
	{
		question: "How do I get support?",
		answer: "For product help, implementation questions, or data issues, use the docs, GitHub issues, or contact links in the footer. If something in the model database looks wrong, reporting it directly is the fastest way to get it reviewed.",
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
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						Frequently asked questions
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						Common questions about AI Stats Gateway.
						Cannot find an answer?{" "}
						<a
							href="mailto:support@ai-stats.phaseo.app"
							className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
						>
							Reach out to our team
						</a>
						.
					</p>
				</div>

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

