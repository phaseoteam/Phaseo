import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { LearnQuiz, LearnScenario } from "@/lib/content/learn";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./shared";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** A tick or cross in a filled circle. The circle settles in, then the stroke draws itself. */
function AnswerMark({ kind, className }: { kind: "right" | "wrong"; className?: string }) {
	const reduce = useReducedMotion();
	const draw = reduce
		? { initial: { pathLength: 1, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.15 } }
		: { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.24, delay: 0.1, ease: EASE_OUT } };
	return (
		<motion.span
			aria-hidden
			className={cn(
				"inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-white",
				kind === "right" ? "bg-emerald-500" : "bg-red-500",
				className,
			)}
			initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.18, ease: EASE_OUT }}
		>
			<svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
				{kind === "right" ? (
					<motion.path d="M3.5 8.5 6.5 11.5 12.5 4.5" {...draw} />
				) : (
					<>
						<motion.path d="M4.5 4.5 11.5 11.5" {...draw} />
						<motion.path d="M11.5 4.5 4.5 11.5" {...draw} transition={{ ...draw.transition, delay: reduce ? 0 : 0.2 }} />
					</>
				)}
			</svg>
		</motion.span>
	);
}

export function LessonQuiz({ quiz }: { quiz: LearnQuiz }) {
	const name = useId();
	const [picked, setPicked] = useState<number | null>(null);
	const [checked, setChecked] = useState(false);
	const correct = checked && picked === quiz.answer;

	return (
		<section aria-labelledby={`${name}-title`} className="mt-10">
			<h2 id={`${name}-title`} className="text-xl font-semibold tracking-tight">
				Check your understanding
			</h2>
			<p className="mt-3 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200"><InlineMarkdown>{quiz.question}</InlineMarkdown></p>
			<ul className="mt-4 space-y-2">
				{quiz.options.map((option, index) => {
					const selected = picked === index;
					const showRight = checked && index === quiz.answer;
					const showWrong = checked && selected && index !== quiz.answer;
					return (
						<li key={option} className="list-none">
							<label
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-6 transition-colors duration-150",
									"border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50",
									selected && !checked && "border-zinc-900 dark:border-zinc-200",
									showRight && "border-emerald-500/70 dark:border-emerald-500/60",
									showWrong && "border-red-500/70 dark:border-red-500/60",
								)}
							>
								<input
									type="radio"
									name={name}
									className="mt-1 accent-zinc-900 dark:accent-zinc-100"
									checked={selected}
									onChange={() => {
										setPicked(index);
										setChecked(false);
									}}
								/>
								<span className="flex-1"><InlineMarkdown>{option}</InlineMarkdown></span>
								{showRight ? <AnswerMark kind="right" className="mt-0.5" /> : null}
								{showWrong ? <AnswerMark kind="wrong" className="mt-0.5" /> : null}
							</label>
						</li>
					);
				})}
			</ul>
			<Button className="mt-4" disabled={picked === null || checked} onClick={() => setChecked(true)}>
				Check answer
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
							{correct ? "That’s right. " : "Not quite. "}
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
	return (
		<section className="mt-10">
			<h2 className="text-xl font-semibold tracking-tight">Apply it</h2>
			<p className="mt-3 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200"><InlineMarkdown>{scenario.prompt}</InlineMarkdown></p>
			<details className="group mt-4 rounded-md border border-zinc-200 dark:border-zinc-800">
				<summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
					<span className="group-open:hidden">Show the answer</span>
					<span className="hidden group-open:inline">Hide the answer</span>
				</summary>
				<p className="border-t border-zinc-200 px-4 py-3 text-[15px] leading-7 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
					<InlineMarkdown>{scenario.answer}</InlineMarkdown>
				</p>
			</details>
		</section>
	);
}
