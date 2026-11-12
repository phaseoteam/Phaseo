import type { ReactNode } from "react";
import { ArrowRight, CircleCheck, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";

// MDX in posts can't pass arrays or objects (next-mdx-remote blocks JS
// expressions), so these blocks compose from children and string attributes.

export function FeatureGrid({
	columns = "2",
	children,
}: {
	columns?: "2" | "3";
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"my-8 grid overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800",
				columns === "3" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
			)}
		>
			{children}
		</div>
	);
}

export function Feature({
	title,
	meta,
	children,
}: {
	title: string;
	meta?: string;
	children: ReactNode;
}) {
	return (
		<div className="-mr-px -mb-px flex flex-col gap-2 border-r border-b border-zinc-200 p-5 dark:border-zinc-800">
			{meta ? (
				<code className="w-fit font-mono text-xs text-sky-700 dark:text-sky-300">
					{meta}
				</code>
			) : null}
			<p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
				{title}
			</p>
			<div className="text-sm leading-6 text-zinc-600 dark:text-zinc-400 [&>p]:m-0 [&>p]:text-sm [&>p]:leading-6">
				{children}
			</div>
		</div>
	);
}

export function Flow({ title, children }: { title?: string; children: ReactNode }) {
	return (
		<figure className="my-8 md:rounded-md md:border md:border-zinc-200 md:bg-zinc-50 md:p-6 md:dark:border-zinc-800 md:dark:bg-zinc-900/40">
			<ol className="grid [counter-reset:flow-step] md:auto-cols-fr md:grid-flow-col md:gap-8">
				{children}
			</ol>
			{title ? (
				<figcaption className="mt-4 text-sm text-zinc-500 md:text-center dark:text-zinc-400">
					{title}
				</figcaption>
			) : null}
		</figure>
	);
}

export function FlowStep({
	title,
	stop,
	ok,
	children,
}: {
	title: string;
	/** What the caller gets when the step refuses the request. */
	stop?: string;
	/** What the caller gets when the step completes the request. */
	ok?: string;
	children?: ReactNode;
}) {
	return (
		// Phones get a numbered timeline; md and up get a row of cards with arrows.
		<li className="group relative flex flex-col gap-1.5 pb-6 pl-11 [counter-increment:flow-step] last:pb-0 md:gap-2 md:last:pb-4 md:rounded-md md:border md:border-zinc-200 md:bg-white md:p-4 md:dark:border-zinc-800 md:dark:bg-zinc-950">
			<span
				aria-hidden="true"
				className="absolute top-0 left-0 flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white font-mono text-xs text-zinc-500 before:[content:counter(flow-step,decimal-leading-zero)] md:static md:size-auto md:justify-start md:border-0 md:bg-transparent md:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 md:dark:bg-transparent md:dark:text-zinc-500"
			/>
			<span
				aria-hidden="true"
				className="absolute top-8 bottom-1 left-3.5 w-px bg-zinc-200 group-last:hidden md:hidden dark:bg-zinc-800"
			/>
			<p className="pt-1 text-sm font-semibold text-zinc-950 md:pt-0 dark:text-zinc-50">
				{title}
			</p>
			{children ? (
				<div className="text-sm leading-6 text-zinc-600 dark:text-zinc-400 [&>p]:m-0 [&>p]:text-sm [&>p]:leading-6">
					{children}
				</div>
			) : null}
			{stop ? (
				<p className="mt-auto flex items-start gap-1.5 pt-1 text-xs font-medium text-rose-700 dark:text-rose-300">
					<OctagonX className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{stop}</span>
				</p>
			) : null}
			{ok ? (
				<p className="mt-auto flex items-start gap-1.5 pt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
					<CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{ok}</span>
				</p>
			) : null}
			<ArrowRight
				aria-hidden="true"
				className="absolute top-1/2 -right-6 hidden h-4 w-4 -translate-y-1/2 text-zinc-400 group-last:hidden md:block"
			/>
		</li>
	);
}
