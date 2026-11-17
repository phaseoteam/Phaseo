import { ArrowRight, Bot, GraduationCap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Link } from "@/i18n/navigation";
import {
	LEARN_AGENT_PROMPT,
	LEARN_COURSES,
	LEARN_PATHS,
	LEVEL_LABELS,
	courseMinutes,
	lessonHref,
	pathMinutes,
} from "@/lib/content/learn";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useLearnProgress } from "./progress";
import { DoneMark, ProgressBar, formatMinutes, pageShell } from "./shared";

export const LEARN_TITLE = "Learn Phaseo";
const LEARN_DESCRIPTION =
	"Short, hands-on courses for using and building with Phaseo, from your first API key to setting it up for a whole team. Or let your coding agent teach you.";

export function getLearnMetadata(_input?: RouteMetadataInput): PageMetadata {
	return buildMetadata({
		title: LEARN_TITLE,
		description: LEARN_DESCRIPTION,
		path: "/learn",
		keywords: ["Phaseo course", "learn Phaseo", "AI gateway tutorial", "LLM API course"],
	});
}

export function LearnHubPage() {
	const { done } = useLearnProgress();
	const firstLesson = LEARN_COURSES[0] ? `${LEARN_COURSES[0].slug}/${LEARN_COURSES[0].lessons[0]?.slug}` : "";

	return (
		<div className={pageShell}>
			<section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
				<div>
					<div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
						<GraduationCap className="size-4" />
						<span>Courses</span>
					</div>
					<h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{LEARN_TITLE}</h1>
					<p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{LEARN_DESCRIPTION}</p>
					<div className="mt-5 flex flex-wrap gap-2">
						<Link href={lessonHref(firstLesson)} className={buttonVariants({ size: "lg" })}>
							Start with the basics
							<ArrowRight data-icon="inline-end" />
						</Link>
						<Link href="#paths" className={buttonVariants({ size: "lg", variant: "outline" })}>
							Pick a path
						</Link>
					</div>
				</div>

				<div className="rounded-md border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Bot className="size-4" />
						Learn in your coding agent
					</div>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
						Paste this into Claude Code, Codex, Cursor or any agent that can fetch URLs. It teaches you Phaseo while
						you build your own project together, and saves your progress in the project.
					</p>
					<div className="mt-3 flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
						<code className="flex-1 text-[13px] leading-5 break-words">{LEARN_AGENT_PROMPT}</code>
						<CopyButton content={LEARN_AGENT_PROMPT} variant="ghost" size="sm" aria-label="Copy prompt" className="mt-0.5" />
					</div>
					<a
						href="/learn.md"
						className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
					>
						Read the course file
						<ArrowRight className="size-3.5" />
					</a>
				</div>
			</section>

			<section id="paths" className="mt-12 scroll-mt-24">
				<h2 className="text-xl font-semibold tracking-tight">Paths</h2>
				<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Lessons picked and ordered for your role.</p>
				<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
					{LEARN_PATHS.map((path) => {
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
									{path.lessons.length} lessons · {formatMinutes(pathMinutes(path))}
									{completed > 0 ? ` · ${completed} done` : ""}
								</div>
								<ProgressBar className="mt-2" done={completed} total={path.lessons.length} />
							</Link>
						);
					})}
				</div>
			</section>

			<section className="mt-12">
				<h2 className="text-xl font-semibold tracking-tight">Courses</h2>
				<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
					{LEARN_COURSES.map((course) => {
						const completed = course.lessons.filter((lesson) => done.has(`${course.slug}/${lesson.slug}`)).length;
						return (
							<div key={course.slug} className="flex flex-col rounded-md border border-zinc-200 p-5 dark:border-zinc-800">
								<div className="text-xs text-zinc-500">
									{LEVEL_LABELS[course.level]} · {course.format} · {formatMinutes(courseMinutes(course))}
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
													<span className="text-xs text-zinc-500">{lesson.minutes} min</span>
												</Link>
											</li>
										);
									})}
								</ol>
								<div className={cn("mt-4 text-xs text-zinc-500", completed === 0 && "invisible")}>
									{completed} of {course.lessons.length} lessons done
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
