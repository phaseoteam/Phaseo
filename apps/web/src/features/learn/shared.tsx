import { useCallback, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale, useTranslations } from "@/i18n/react";
import type { PublicLocale } from "@/i18n/routing";
import { getLocalizedDocsHref } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { learnOutlineQuery } from "./learn.functions";

const FEATURE_MATURITY_URL = "https://phaseo.app/docs/v1/developers/feature-maturity";
const DOCS_PREFIX = "https://phaseo.app/docs/";

/** Lesson content links to the English docs; send readers to their own language's docs. */
export function useLocalizeHref() {
	const locale = useLocale();
	return useCallback((href: string) => (href.startsWith(DOCS_PREFIX) ? getLocalizedDocsHref(locale, href) : href), [locale]);
}

export function useLearnOutline() {
	const locale = useLocale() as PublicLocale;
	return useSuspenseQuery(learnOutlineQuery(locale)).data;
}

function useMarkdownComponents(): { block: Components; inline: Components } {
	const localize = useLocalizeHref();
	return useMemo(() => {
		const strong: Components["strong"] = (props) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100" {...props} />;
		const code: Components["code"] = (props) => (
			<code className="rounded-[4px] bg-zinc-100 px-1.5 py-0.5 text-[13px] dark:bg-zinc-800" {...props} />
		);
		const a: Components["a"] = ({ href, children, ...props }) => {
			const external = typeof href === "string" && href.startsWith("http");
			return (
				<a
					href={typeof href === "string" ? localize(href) : href}
					{...props}
					className="text-blue-600 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current dark:text-blue-400"
					target={external ? "_blank" : undefined}
					rel={external ? "noreferrer noopener" : undefined}
				>
					{children}
				</a>
			);
		};
		const block: Components = {
			h2: ({ children, ...props }) => (
				<h2 className="mt-8 text-xl font-semibold tracking-tight" {...props}>
					{children}
				</h2>
			),
			h3: ({ children, ...props }) => (
				<h3 className="mt-6 text-lg font-semibold tracking-tight" {...props}>
					{children}
				</h3>
			),
			p: (props) => <p className="mt-4 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300" {...props} />,
			ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300 rtl:pr-6 rtl:pl-0" {...props} />,
			ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300 rtl:pr-6 rtl:pl-0" {...props} />,
			strong,
			a,
			pre: (props) => (
				<pre
					dir="ltr"
					className="mt-4 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 text-[13px] leading-6 dark:border-zinc-800 dark:bg-zinc-900 [&_code]:bg-transparent [&_code]:p-0"
					{...props}
				/>
			),
			code,
			table: (props) => (
				<div className="mt-4 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
					<table className="w-full border-collapse text-start text-sm" {...props} />
				</div>
			),
			thead: (props) => <thead className="bg-zinc-50 dark:bg-zinc-900/60" {...props} />,
			th: (props) => <th className="border-b border-zinc-200 px-3 py-2 text-start font-medium dark:border-zinc-800" {...props} />,
			td: (props) => (
				<td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700 dark:border-zinc-800/60 dark:text-zinc-300" {...props} />
			),
		};
		const inline: Components = { p: ({ children }) => <>{children}</>, strong, code, a };
		return { block, inline };
	}, [localize]);
}

export function LessonMarkdown({ children }: { children: string }) {
	const { block } = useMarkdownComponents();
	return (
		<ReactMarkdown components={block} remarkPlugins={[remarkGfm]}>
			{children}
		</ReactMarkdown>
	);
}

/** For one-line copy (quiz options, takeaways): inline code, bold and links only. */
export function InlineMarkdown({ children }: { children: string }) {
	const { inline } = useMarkdownComponents();
	return <ReactMarkdown components={inline}>{children}</ReactMarkdown>;
}

/** Links to Feature maturity unless `link` is false (e.g. when already inside a link). */
export function StageBadge({ stage, link = true }: { stage: "alpha" | "beta"; link?: boolean }) {
	const locale = useLocale();
	const t = useTranslations("Content.learn");
	return (
		<Badge
			variant="outline"
			className="rounded-[4px]"
			// Badge renders its children inside this anchor.
			// oxlint-disable-next-line jsx-a11y/anchor-has-content
			render={link ? <a href={getLocalizedDocsHref(locale, FEATURE_MATURITY_URL)} target="_blank" rel="noreferrer" /> : undefined}
		>
			{stage === "alpha" ? t("stageAlpha") : t("stageBeta")}
		</Badge>
	);
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
	const t = useTranslations("Content.learn");
	const percent = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<div
			className={cn("h-1.5 w-full overflow-hidden rounded-[2px] bg-zinc-200 dark:bg-zinc-800", className)}
			role="progressbar"
			aria-label={t("lessonsComplete", { done, total })}
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={done}
		>
			<div className="h-full rounded-[2px] bg-emerald-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
		</div>
	);
}

export function DoneMark({ done, className }: { done: boolean; className?: string }) {
	const t = useTranslations("Content.learn");
	return done ? (
		<CheckCircle2 aria-label={t("done")} className={cn("size-4 shrink-0 text-emerald-600 dark:text-emerald-400", className)} />
	) : (
		<Circle aria-hidden className={cn("size-4 shrink-0 text-zinc-300 dark:text-zinc-700", className)} />
	);
}

export function useFormatMinutes() {
	const t = useTranslations("Content.learn");
	return (minutes: number): string => {
		if (minutes < 60) return t("minutesShort", { count: minutes });
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return rest ? t("hoursMinutesShort", { hours, minutes: rest }) : t("hoursShort", { hours });
	};
}

export const pageShell = "container mx-auto w-full max-w-6xl px-4 py-8 md:py-12";
