import { ArrowRight, Bot, GraduationCap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";
import { LEARN_AGENT_PROMPT, courseMinutes, lessonHref, pathMinutes } from "@/lib/content/learn/outline";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useLearnProgress } from "./progress";
import { DoneMark, ProgressBar, pageShell, useFormatMinutes, useLearnOutline } from "./shared";

export async function getLearnMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params as { locale: PublicLocale };
	const t = await getTranslations({ locale, namespace: "Content.learn" });
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/learn",
		keywords: ["Phaseo course", "learn Phaseo", "AI gateway tutorial", "LLM API course"],
	});
}

export function LearnHubPage() {
	const t = useTranslations("Content.learn");
	const outline = useLearnOutline();
	const formatMinutes = useFormatMinutes();
	const { done } = useLearnProgress();
	const first = outline.courses[0];
	const firstLesson = first?.lessons[0] ? `${first.slug}/${first.lessons[0].slug}` : "";

	return (
		<div className={pageShell}>
			<section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
				<div>
					<div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
						<GraduationCap className="size-4" />
						<span>{t("eyebrow")}</span>
					</div>
					<h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{t("title")}</h1>
					<p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{t("description")}</p>
					<div className="mt-5 flex flex-wrap gap-2">
						<Link href={lessonHref(firstLesson)} className={buttonVariants({ size: "lg" })}>
							{t("startBasics")}
							<ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
						</Link>
						<Link href="#paths" className={buttonVariants({ size: "lg", variant: "outline" })}>
							{t("pickPath")}
						</Link>
					</div>
				</div>

				<div className="rounded-md border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Bot className="size-4" />
						{t("agentTitle")}
					</div>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{t("agentBody")}</p>
					<div dir="ltr" className="mt-3 flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
						<code className="flex-1 text-[13px] leading-5 break-words">{LEARN_AGENT_PROMPT}</code>
						<CopyButton content={LEARN_AGENT_PROMPT} variant="ghost" size="sm" aria-label={t("copyPrompt")} className="mt-0.5" />
					</div>
					<a href="/learn.md" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
						{t("readCourseFile")}
						<ArrowRight className="size-3.5 rtl:rotate-180" />
					</a>
				</div>
			</section>

			<section id="paths" className="mt-12 scroll-mt-24">
				<h2 className="text-xl font-semibold tracking-tight">{t("pathsHeading")}</h2>
				<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("pathsIntro")}</p>
				<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
					{outline.paths.map((path) => {
						const completed = path.lessons.filter((ref) => done.has(ref)).length;
						return (
							<Link
								key={path.slug}
								href={`/learn/paths/${path.slug}`}
								className="group flex flex-col rounded-md border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
							>
								<div className="text-base font-semibold">{path.title}</div>
								<p className="mt-1 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{path.audience}</p>
								<div className="mt-4 text-xs text-zinc-500">
									{t("lessonsAndTime", { count: path.lessons.length, time: formatMinutes(pathMinutes(outline, path)) })}
									{completed > 0 ? ` · ${t("doneCount", { count: completed })}` : ""}
								</div>
								<ProgressBar className="mt-2" done={completed} total={path.lessons.length} />
							</Link>
						);
					})}
				</div>
			</section>

			<section className="mt-12">
				<h2 className="text-xl font-semibold tracking-tight">{t("coursesHeading")}</h2>
				<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
					{outline.courses.map((course) => {
						const completed = course.lessons.filter((lesson) => done.has(`${course.slug}/${lesson.slug}`)).length;
						return (
							<div key={course.slug} className="flex flex-col rounded-md border border-zinc-200 p-5 dark:border-zinc-800">
								<div className="text-xs text-zinc-500">
									{t(`level.${course.level}`)} · {course.format} · {formatMinutes(courseMinutes(course))}
								</div>
								<Link href={`/learn/${course.slug}`} className="mt-1 text-lg font-semibold hover:underline">
									{course.title}
								</Link>
								<p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{course.summary}</p>
								<ol className="mt-4 space-y-1.5">
									{course.lessons.map((lesson) => {
										const ref = `${course.slug}/${lesson.slug}`;
										return (
											<li key={lesson.slug}>
												<Link
													href={lessonHref(ref)}
													className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
												>
													<DoneMark done={done.has(ref)} />
													<span className="flex-1">{lesson.title}</span>
													<span className="text-xs text-zinc-500">{t("minutesShort", { count: lesson.minutes })}</span>
												</Link>
											</li>
										);
									})}
								</ol>
								<div className={cn("mt-4 text-xs text-zinc-500", completed === 0 && "invisible")}>
									{t("lessonsDone", { done: completed, total: course.lessons.length })}
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
