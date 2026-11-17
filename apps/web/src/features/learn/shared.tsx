import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/i18n/react";
import { getLocalizedDocsHref } from "@/lib/docs";
import { cn } from "@/lib/utils";

const FEATURE_MATURITY_URL = "https://phaseo.app/docs/v1/developers/feature-maturity";

const markdownComponents: Components = {
	h2: (props) => <h2 className="mt-8 text-xl font-semibold tracking-tight" {...props} />,
	h3: (props) => <h3 className="mt-6 text-lg font-semibold tracking-tight" {...props} />,
	p: (props) => <p className="mt-4 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300" {...props} />,
	ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300" {...props} />,
	ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300" {...props} />,
	strong: (props) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100" {...props} />,
	a: ({ href, ...props }) => {
		const external = typeof href === "string" && href.startsWith("http");
		return (
			<a
				href={href}
				{...props}
				className="text-blue-600 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current dark:text-blue-400"
				target={external ? "_blank" : undefined}
				rel={external ? "noreferrer noopener" : undefined}
			/>
		);
	},
	pre: (props) => (
		<pre
			className="mt-4 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 text-[13px] leading-6 dark:border-zinc-800 dark:bg-zinc-900 [&_code]:bg-transparent [&_code]:p-0"
			{...props}
		/>
	),
	code: (props) => <code className="rounded-[4px] bg-zinc-100 px-1.5 py-0.5 text-[13px] dark:bg-zinc-800" {...props} />,
	table: (props) => (
		<div className="mt-4 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
			<table className="w-full border-collapse text-left text-sm" {...props} />
		</div>
	),
	thead: (props) => <thead className="bg-zinc-50 dark:bg-zinc-900/60" {...props} />,
	th: (props) => <th className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800" {...props} />,
	td: (props) => <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700 dark:border-zinc-800/60 dark:text-zinc-300" {...props} />,
};

export function LessonMarkdown({ children }: { children: string }) {
	return (
		<ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
			{children}
		</ReactMarkdown>
	);
}

/** Links to Feature maturity unless `link` is false (e.g. when already inside a link). */
const inlineComponents: Components = {
	p: ({ children }) => <>{children}</>,
	strong: markdownComponents.strong,
	code: markdownComponents.code,
	a: markdownComponents.a,
};

/** For one-line copy (quiz options, takeaways): inline code, bold and links only. */
export function InlineMarkdown({ children }: { children: string }) {
	return <ReactMarkdown components={inlineComponents}>{children}</ReactMarkdown>;
}

export function StageBadge({ stage, link = true }: { stage: "alpha" | "beta"; link?: boolean }) {
	const locale = useLocale();
	return (
		<Badge
			variant="outline"
			className="rounded-[4px]"
			render={link ? <a href={getLocalizedDocsHref(locale, FEATURE_MATURITY_URL)} target="_blank" rel="noreferrer" /> : undefined}
		>
			{stage === "alpha" ? "Alpha" : "Beta"}
		</Badge>
	);
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
	const percent = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<div
			className={cn("h-1.5 w-full overflow-hidden rounded-[2px] bg-zinc-200 dark:bg-zinc-800", className)}
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={done}
		>
			<div className="h-full rounded-[2px] bg-emerald-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
		</div>
	);
}

export function DoneMark({ done, className }: { done: boolean; className?: string }) {
	return done ? (
		<CheckCircle2 aria-label="Done" className={cn("size-4 shrink-0 text-emerald-600 dark:text-emerald-400", className)} />
	) : (
		<Circle aria-hidden className={cn("size-4 shrink-0 text-zinc-300 dark:text-zinc-700", className)} />
	);
}

export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export const pageShell = "container mx-auto w-full max-w-6xl px-4 py-8 md:py-12";
