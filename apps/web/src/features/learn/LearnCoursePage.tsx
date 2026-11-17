import { useParams } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LEVEL_LABELS, courseMinutes, getLearnCourse, lessonHref } from "@/lib/content/learn";
import { notFound } from "@/lib/navigation";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { LEARN_TITLE } from "./LearnHubPage";
import { useLearnProgress } from "./progress";
import { DoneMark, ProgressBar, StageBadge, formatMinutes, pageShell } from "./shared";

export function getLearnCourseMetadata({ params }: RouteMetadataInput): PageMetadata {
	const { course: slug } = params as { course: string };
	const course = getLearnCourse(slug);
	return buildMetadata({
		title: course ? `${course.title} | ${LEARN_TITLE}` : LEARN_TITLE,
		description: course?.summary ?? "",
		path: `/learn/${slug}`,
	});
}

export function LearnCoursePage() {
	const { course: slug } = useParams({ from: "/{-$locale}/_dashboard/learn/$course/" });
	const course = getLearnCourse(slug);
	const { done } = useLearnProgress();
	if (!course) notFound();

	const refs = course.lessons.map((lesson) => `${course.slug}/${lesson.slug}`);
	const completed = refs.filter((ref) => done.has(ref)).length;
	const next = refs.find((ref) => !done.has(ref)) ?? refs[0];

	return (
		<div className={pageShell}>
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/learn" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					{LEARN_TITLE}
				</Link>
				<ChevronRight className="size-4" />
				<span className="truncate">{course.title}</span>
			</nav>

			<div className="max-w-3xl">
				<div className="text-sm text-zinc-500">
					{LEVEL_LABELS[course.level]} · {course.format} · about {formatMinutes(courseMinutes(course))}
				</div>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{course.title}</h1>
				<p className="mt-3 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{course.summary}</p>

				{course.prerequisites.length > 0 ? (
					<div className="mt-6">
						<h2 className="text-sm font-semibold">Before you start</h2>
						<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
							{course.prerequisites.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				) : null}

				<div className="mt-6 flex flex-wrap items-center gap-4">
					{next ? (
						<Link href={lessonHref(next)} className={buttonVariants({ size: "lg" })}>
							{completed === 0 ? "Start course" : completed === refs.length ? "Review course" : "Continue"}
							<ArrowRight data-icon="inline-end" />
						</Link>
					) : null}
					<div className="min-w-48 flex-1">
						<div className="text-xs text-zinc-500">
							{completed} of {refs.length} lessons complete
						</div>
						<ProgressBar className="mt-1.5" done={completed} total={refs.length} />
					</div>
				</div>

				<ol className="mt-10 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
					{course.lessons.map((lesson, index) => {
						const ref = refs[index] ?? "";
						return (
							<li key={lesson.slug}>
								<Link
									href={lessonHref(ref)}
									className="flex gap-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
								>
									<span className="w-6 pt-0.5 text-right text-sm tabular-nums text-zinc-400">{index + 1}</span>
									<span className="flex-1">
										<span className="flex flex-wrap items-center gap-2 font-medium">
											{lesson.title}
											{lesson.stage ? <StageBadge stage={lesson.stage} link={false} /> : null}
										</span>
										<span className="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">{lesson.summary}</span>
									</span>
									<span className="flex flex-col items-end gap-2 pt-0.5">
										<DoneMark done={done.has(ref)} />
										<span className="text-xs text-zinc-500">{lesson.minutes} min</span>
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
