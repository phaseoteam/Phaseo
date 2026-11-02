import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, CircleCheck, OctagonX } from "lucide-react";
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
		<figure className="my-8 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-6">
			<ol className="grid gap-3 [counter-reset:flow-step] md:auto-cols-fr md:grid-flow-col md:gap-8">
				{children}
			</ol>
			{title ? (
				<figcaption className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
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
		<li className="group relative flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-4 [counter-increment:flow-step] dark:border-zinc-800 dark:bg-zinc-950">
			<span
				aria-hidden="true"
				className="font-mono text-xs text-zinc-400 before:[content:counter(flow-step,decimal-leading-zero)] dark:text-zinc-500"
			/>
			<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
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
			<ArrowDown
				aria-hidden="true"
				className="absolute -bottom-3 left-1/2 z-10 h-4 w-4 -translate-x-1/2 translate-y-1/2 text-zinc-400 group-last:hidden md:hidden"
			/>
			<ArrowRight
				aria-hidden="true"
				className="absolute top-1/2 -right-6 hidden h-4 w-4 -translate-y-1/2 text-zinc-400 group-last:hidden md:block"
			/>
		</li>
	);
}
