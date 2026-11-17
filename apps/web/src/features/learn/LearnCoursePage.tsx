import { useParams } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";
import { courseMinutes, getOutlineCourse, lessonHref } from "@/lib/content/learn/outline";
import { notFound } from "@/lib/navigation";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { useLearnProgress } from "./progress";
import { DoneMark, ProgressBar, StageBadge, pageShell, useFormatMinutes, useLearnOutline } from "./shared";

export async function getLearnCourseMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale, course: slug } = params as { locale: PublicLocale; course: string };
	const [{ loadLearnCatalog }, t] = await Promise.all([
		import("@/lib/content/learn/catalog"),
		getTranslations({ locale, namespace: "Content.learn" }),
	]);
	const course = (await loadLearnCatalog(locale)).courses.find((item) => item.slug === slug);
	return buildMetadata({
		title: course ? `${course.title} | ${t("title")}` : t("title"),
		description: course?.summary ?? t("description"),
		path: `/learn/${slug}`,
	});
}

export function LearnCoursePage() {
	const { course: slug } = useParams({ from: "/{-$locale}/_dashboard/learn/$course/" });
	const t = useTranslations("Content.learn");
	const outline = useLearnOutline();
	const formatMinutes = useFormatMinutes();
	const course = getOutlineCourse(outline, slug);
	const { done } = useLearnProgress();
	if (!course) notFound();

	const refs = course.lessons.map((lesson) => `${course.slug}/${lesson.slug}`);
	const completed = refs.filter((ref) => done.has(ref)).length;
	const next = refs.find((ref) => !done.has(ref)) ?? refs[0];

	return (
		<div className={pageShell}>
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/learn" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					{t("title")}
				</Link>
				<ChevronRight className="size-4 rtl:rotate-180" />
				<span className="truncate">{course.title}</span>
			</nav>

			<div className="max-w-3xl">
				<div className="text-sm text-zinc-500">
					{t(`level.${course.level}`)} · {course.format} · {t("aboutTime", { time: formatMinutes(courseMinutes(course)) })}
				</div>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{course.title}</h1>
				<p className="mt-3 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{course.summary}</p>

				{course.prerequisites.length > 0 ? (
					<div className="mt-6">
						<h2 className="text-sm font-semibold">{t("beforeYouStart")}</h2>
						<ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-zinc-700 dark:text-zinc-300">
							{course.prerequisites.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="mt-6 flex flex-wrap items-center gap-4">
					{next ? (
						<Link href={lessonHref(next)} className={buttonVariants({ size: "lg" })}>
							{completed === 0 ? t("startCourse") : completed === refs.length ? t("reviewCourse") : t("continue")}
							<ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
						</Link>
					) : null}
					<div className="min-w-48 flex-1">
						<div className="text-xs text-zinc-500">{t("lessonsComplete", { done: completed, total: refs.length })}</div>
						<ProgressBar className="mt-1.5" done={completed} total={refs.length} />
					</div>
				</div>

				<ol className="mt-10 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
					{course.lessons.map((lesson, index) => {
						const ref = refs[index] ?? "";
						return (
							<li key={lesson.slug}>
								<Link href={lessonHref(ref)} className="flex gap-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
									<span className="w-6 pt-0.5 text-end text-sm tabular-nums text-zinc-400">{index + 1}</span>
									<span className="flex-1">
										<span className="flex flex-wrap items-center gap-2 font-medium">
											{lesson.title}
											{lesson.stage ? <StageBadge stage={lesson.stage} link={false} /> : null}
										</span>
										<span className="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">{lesson.summary}</span>
									</span>
									<span className="flex flex-col items-end gap-2 pt-0.5">
										<DoneMark done={done.has(ref)} />
										<span className="text-xs text-zinc-500">{t("minutesShort", { count: lesson.minutes })}</span>
									</span>
								</Link>
							</li>
						);
					})}
				</ol>
			</div>
		</div>
	);
}
