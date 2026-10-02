"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface FAQItemProps {
	question: string;
	answer: ReactNode;
	isOpen: boolean;
	index: number;
	onToggle: () => void;
}

function FAQItem({ question, answer, isOpen, index, onToggle }: FAQItemProps) {
	const answerId = `faq-answer-${index}`;

	return (
		<article
			className={cn(
				"group overflow-hidden rounded-xl border transition-all duration-300",
				isOpen
					? "border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
					: "border-zinc-200/60 bg-white/80 hover:border-zinc-300/80 hover:bg-white dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70",
			)}
		>
			<h2>
				<button
					onClick={onToggle}
					type="button"
					aria-expanded={isOpen}
					aria-controls={answerId}
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
			</h2>
			<div
				aria-hidden={!isOpen}
				inert={isOpen ? undefined : true}
				className={cn(
					"grid transition-all duration-300",
					isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div id={answerId} className="overflow-hidden">
					<div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">
						<p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
							{answer}
						</p>
					</div>
				</div>
			</div>
		</article>
	);
}

export function FAQSection() {
	const t = useTranslations("Site.faq");
	const rich = t.rich as unknown as (key: string, values: Record<string, (children: ReactNode) => ReactNode>) => ReactNode;
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const link = (href: string) => (children: ReactNode) => (
		<Link href={href} className="font-medium underline underline-offset-4">{children}</Link>
	);
	const items = [
		{ question: t("items.0.question"), answer: rich("items.0.answer", { models: link("/models") }) },
		{ question: t("items.1.question"), answer: t("items.1.answer") },
		{ question: t("items.2.question"), answer: rich("items.2.answer", { pricingMethodology: link("/how-phaseo-calculates-model-pricing"), calculator: link("/tools/pricing-calculator") }) },
		{ question: t("items.3.question"), answer: t("items.3.answer") },
		{ question: t("items.4.question"), answer: t("items.4.answer") },
		{ question: t("items.5.question"), answer: t("items.5.answer") },
		{ question: t("items.6.question"), answer: rich("items.6.answer", { providers: link("/api-providers") }) },
		{ question: t("items.7.question"), answer: rich("items.7.answer", { benchmarkMethodology: link("/how-phaseo-normalises-ai-benchmarks"), performanceMethodology: link("/how-phaseo-measures-latency-throughput") }) },
		{ question: t("items.8.question"), answer: rich("items.8.answer", { contribute: link("/contribute") }) },
	] as const;

	const handleToggle = (index: number) => {
		setOpenIndex(openIndex === index ? null : index);
	};

	const midPoint = Math.ceil(items.length / 2);
	const leftColumn = items.slice(0, midPoint);
	const rightColumn = items.slice(midPoint);

	return (
		<section className="relative overflow-hidden py-20 sm:py-28">
			<div className="relative mx-auto max-w-7xl px-6 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">{t("title")}</h1>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						{rich("intro", { support: (children) => <a href="mailto:support@phaseo.app" className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300">{children}</a> })}
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
								index={index}
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
								index={actualIndex}
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
