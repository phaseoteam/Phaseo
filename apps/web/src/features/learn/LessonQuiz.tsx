import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { LearnQuiz, LearnScenario } from "@/lib/content/learn";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./shared";

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
								"flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-6 transition-colors",
								"border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50",
								selected && !checked && "border-zinc-900 dark:border-zinc-200",
								showRight && "border-emerald-500 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-950/30",
								showWrong && "border-red-500 bg-red-50 dark:border-red-500/60 dark:bg-red-950/30",
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
							<span><InlineMarkdown>{option}</InlineMarkdown></span>
						</label>
						</li>
					);
				})}
			</ul>
			<Button className="mt-4" disabled={picked === null} onClick={() => setChecked(true)}>
				Check answer
			</Button>
			{checked ? (
				<Callout className="mt-4" tone={correct ? "success" : "warning"} title={correct ? "That's right" : "Not quite"} role="status">
					<InlineMarkdown>{quiz.explanation}</InlineMarkdown>
				</Callout>
			) : null}
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
