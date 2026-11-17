import { useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ChevronRight, ExternalLink, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Link } from "@/i18n/navigation";
import { getLearnLesson, lessonHref, lessonPathPositions } from "@/lib/content/learn";
import { notFound } from "@/lib/navigation";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { LEARN_TITLE } from "./LearnHubPage";
import { LessonQuiz, LessonScenario } from "./LessonQuiz";
import { useLearnProgress } from "./progress";
import { DoneMark, InlineMarkdown, LessonMarkdown, StageBadge, pageShell } from "./shared";

export function getLearnLessonMetadata({ params }: RouteMetadataInput): PageMetadata {
	const { course, lesson } = params as { course: string; lesson: string };
	const found = getLearnLesson(course, lesson);
	return buildMetadata({
		title: found ? `${found.lesson.title} | ${found.course.title}` : LEARN_TITLE,
		description: found?.lesson.summary ?? "",
		path: `/learn/${course}/${lesson}`,
		type: "article",
	});
}

function formatUpdated(iso: string): string {
	const date = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(date.getTime())
		? iso
		: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export function LearnLessonPage() {
	const params = useParams({ from: "/{-$locale}/_dashboard/learn/$course/$lesson/" });
	const found = getLearnLesson(params.course, params.lesson);
	const { done, setDone } = useLearnProgress();
	if (!found) notFound();

	const { course, lesson, ref } = found;
	const index = course.lessons.findIndex((item) => item.slug === lesson.slug);
	const prev = course.lessons[index - 1];
	const next = course.lessons[index + 1];
	const isDone = done.has(ref);
	const paths = lessonPathPositions(ref);

	return (
		<div className={pageShell}>
			<nav className="mb-6 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/learn" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					{LEARN_TITLE}
				</Link>
				<ChevronRight className="size-4 shrink-0" />
				<Link href={`/learn/${course.slug}`} className="truncate hover:text-zinc-900 dark:hover:text-zinc-100">
					{course.title}
				</Link>
			</nav>

			<div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
				<aside className="order-2 lg:order-1">
					<div className="lg:sticky lg:top-24">
						<Link href={`/learn/${course.slug}`} className="text-sm font-semibold hover:underline">
							{course.title}
						</Link>
						<ol className="mt-3 space-y-1">
							{course.lessons.map((item, i) => {
								const itemRef = `${course.slug}/${item.slug}`;
								const current = item.slug === lesson.slug;
								return (
									<li key={item.slug}>
										<Link
											href={lessonHref(itemRef)}
											aria-current={current ? "page" : undefined}
											className={cn(
												"flex items-start gap-2 rounded-md px-2 py-1.5 text-sm leading-5 transition-colors",
												current
													? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800/70 dark:text-zinc-50"
													: "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100",
											)}
										>
											<DoneMark done={done.has(itemRef)} className="mt-0.5" />
											<span>
												{i + 1}. {item.title}
											</span>
										</Link>
									</li>
								);
							})}
						</ol>
						{paths.length > 0 ? (
							<ul className="mt-6 space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
								{paths.map(({ path, position, total }) => (
									<li key={path.slug}>
										<Link href={`/learn/paths/${path.slug}`} className="hover:text-zinc-900 dark:hover:text-zinc-100">
											{path.title} path · {position} of {total}
										</Link>
									</li>
								))}
							</ul>
						) : null}
					</div>
				</aside>

				<article className="order-1 max-w-3xl lg:order-2">
					<div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
						<span>
							Lesson {index + 1} of {course.lessons.length} · {lesson.minutes} minutes
						</span>
						{lesson.stage ? <StageBadge stage={lesson.stage} /> : null}
					</div>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{lesson.title}</h1>
					<p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">{lesson.summary}</p>

					<div className="mt-6">
						<LessonMarkdown>{lesson.body}</LessonMarkdown>
					</div>

					<LessonQuiz key={`${ref}-quiz`} quiz={lesson.quiz} />
					<LessonScenario key={`${ref}-scenario`} scenario={lesson.scenario} />

					<section className="mt-10">
						<h2 className="text-xl font-semibold tracking-tight">Takeaway</h2>
						<Callout className="mt-3" tone="info" icon={Lightbulb}>
							<InlineMarkdown>{lesson.takeaway}</InlineMarkdown>
						</Callout>
					</section>

					{lesson.links.length > 0 ? (
						<section className="mt-10">
							<h2 className="text-xl font-semibold tracking-tight">Related links</h2>
							<ul className="mt-3 space-y-2">
								{lesson.links.map((item) => {
									const external = item.href.startsWith("http");
									return (
										<li key={item.href}>
											{external ? (
												<a
													href={item.href}
													target="_blank"
													rel="noreferrer noopener"
													className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
												>
													{item.label}
													<ExternalLink className="size-3.5" />
												</a>
											) : (
												<Link href={item.href} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
													{item.label}
												</Link>
											)}
										</li>
									);
								})}
							</ul>
						</section>
					) : null}

					<div className="mt-10 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
						<Button variant={isDone ? "outline" : "default"} size="lg" onClick={() => setDone(ref, !isDone)}>
							<Check data-icon="inline-start" />
							{isDone ? "Done" : "Mark as done"}
						</Button>
						<span className="text-xs text-zinc-500">Progress is saved in this browser.</span>
					</div>

					<nav className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
						{prev ? (
							<Link
								href={lessonHref(`${course.slug}/${prev.slug}`)}
								className="flex flex-col rounded-md border border-zinc-200 p-4 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
							>
								<span className="inline-flex items-center gap-1 text-xs text-zinc-500">
									<ArrowLeft className="size-3.5" /> Previous
								</span>
								<span className="mt-1 font-medium">{prev.title}</span>
							</Link>
						) : (
							<Link
								href={`/learn/${course.slug}`}
								className="flex flex-col rounded-md border border-zinc-200 p-4 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
							>
								<span className="inline-flex items-center gap-1 text-xs text-zinc-500">
									<ArrowLeft className="size-3.5" /> Course overview
								</span>
								<span className="mt-1 font-medium">{course.title}</span>
							</Link>
						)}
						{next ? (
							<Link
								href={lessonHref(`${course.slug}/${next.slug}`)}
								onClick={() => setDone(ref, true)}
								className="flex flex-col rounded-md border border-zinc-200 p-4 text-right text-sm transition-colors hover:bg-zinc-50 sm:col-start-2 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
							>
								<span className="inline-flex items-center justify-end gap-1 text-xs text-zinc-500">
									Next lesson <ArrowRight className="size-3.5" />
								</span>
								<span className="mt-1 font-medium">{next.title}</span>
							</Link>
						) : (
							<Link
								href="/learn"
								className="flex flex-col rounded-md border border-zinc-200 p-4 text-right text-sm transition-colors hover:bg-zinc-50 sm:col-start-2 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
							>
								<span className="inline-flex items-center justify-end gap-1 text-xs text-zinc-500">
									Course complete <ArrowRight className="size-3.5" />
								</span>
								<span className="mt-1 font-medium">Back to all courses</span>
							</Link>
						)}
					</nav>

					<p className="mt-8 text-xs text-zinc-500">Last checked {formatUpdated(lesson.updated)}</p>
				</article>
			</div>
		</div>
	);
}
