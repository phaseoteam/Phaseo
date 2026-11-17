import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/react";
import type { LearnQuiz, LearnScenario } from "@/lib/content/learn/outline";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./shared";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Strokes draw on screen, so they use the even in-out curve: a front-loaded ease-out finishes
// almost the whole stroke in the first frames and reads as no animation at all.
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

type CheckState = "empty" | "picked" | "right" | "wrong";

/**
 * The option’s selection box. Picking an option fills it and draws a tick; checking the
 * answer turns it green (tick) or red (cross). Each new mark redraws its stroke.
 */
function CheckBox({ state }: { state: CheckState }) {
	const reduce = useReducedMotion();
	const draw = (delay = 0) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
			: { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.3, delay: 0.06 + delay, ease: EASE_IN_OUT } };
	return (
		<motion.span
			key={state === "empty" ? "empty" : state}
			aria-hidden
			initial={reduce || state === "empty" ? false : { scale: 0.85 }}
			animate={{ scale: 1 }}
			transition={{ duration: 0.2, ease: EASE_OUT }}
			className={cn(
				"mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border text-white",
				"transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
				"peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30",
				state === "empty" && "border-zinc-300 bg-transparent dark:border-zinc-600",
				state === "picked" && "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900",
				state === "right" && "border-emerald-500 bg-emerald-500",
				state === "wrong" && "border-red-500 bg-red-500",
			)}
		>
			{state === "empty" ? null : (
				<svg key={state} viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
					{state === "wrong" ? (
						<>
							<motion.path d="M4.5 4.5 11.5 11.5" {...draw()} />
							<motion.path d="M11.5 4.5 4.5 11.5" {...draw(0.16)} />
						</>
					) : (
						<motion.path d="M3.5 8.5 6.5 11.5 12.5 4.5" {...draw()} />
					)}
				</svg>
			)}
		</motion.span>
	);
}

export function LessonQuiz({ quiz }: { quiz: LearnQuiz }) {
	const name = useId();
	const [picked, setPicked] = useState<number | null>(null);
	const [checked, setChecked] = useState(false);
	const correct = checked && picked === quiz.answer;
	const t = useTranslations("Content.learn");

	return (
		<section aria-labelledby={`${name}-title`} className="mt-10">
			<h2 id={`${name}-title`} className="text-xl font-semibold tracking-tight">
				{t("checkUnderstanding")}
			</h2>
			<p className="mt-3 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200"><InlineMarkdown>{quiz.question}</InlineMarkdown></p>
			<ul className="mt-4 space-y-2">
				{quiz.options.map((option, index) => {
					const selected = picked === index;
					const showRight = checked && index === quiz.answer;
					const showWrong = checked && selected && index !== quiz.answer;
					return (
						<li key={index} className="list-none">
							<label
								className={cn(
									"group/option flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-6 transition-colors duration-150",
									"border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50",
									selected && !checked && "border-zinc-900 dark:border-zinc-200",
									showRight && "border-emerald-500/70 dark:border-emerald-500/60",
									showWrong && "border-red-500/70 dark:border-red-500/60",
								)}
							>
								<input
									type="radio"
									name={name}
									className="peer sr-only"
									checked={selected}
									onChange={() => {
										setPicked(index);
										setChecked(false);
									}}
								/>
								<CheckBox state={showRight ? "right" : showWrong ? "wrong" : selected ? "picked" : "empty"} />
								<span className="flex-1"><InlineMarkdown>{option}</InlineMarkdown></span>
							</label>
						</li>
					);
				})}
			</ul>
			<Button className="mt-4" disabled={picked === null || checked} onClick={() => setChecked(true)}>
				{t("checkAnswer")}
			</Button>
			<div role="status" aria-live="polite">
				{checked ? (
					<motion.div
						className="mt-4 text-sm leading-6"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.2, ease: EASE_OUT }}
					>
						<span className={cn("font-medium", correct ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
							{correct ? t("correct") : t("incorrect")}{" "}
						</span>
						<span className="text-zinc-700 dark:text-zinc-300">
							<InlineMarkdown>{quiz.explanation}</InlineMarkdown>
						</span>
					</motion.div>
				) : null}
			</div>
		</section>
	);
}

export function LessonScenario({ scenario }: { scenario: LearnScenario }) {
	const t = useTranslations("Content.learn");
	return (
		<section className="mt-10">
			<h2 className="text-xl font-semibold tracking-tight">{t("applyIt")}</h2>
			<p className="mt-3 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200"><InlineMarkdown>{scenario.prompt}</InlineMarkdown></p>
			<details className="group mt-4 rounded-md border border-zinc-200 dark:border-zinc-800">
				<summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
					<span className="group-open:hidden">{t("showAnswer")}</span>
					<span className="hidden group-open:inline">{t("hideAnswer")}</span>
				</summary>
				<p className="border-t border-zinc-200 px-4 py-3 text-[15px] leading-7 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
					<InlineMarkdown>{scenario.answer}</InlineMarkdown>
				</p>
			</details>
		</section>
	);
}
