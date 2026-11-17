import { useParams } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLearnPath, lessonHref, pathLessons, pathMinutes, type ResolvedLesson } from "@/lib/content/learn";
import { notFound } from "@/lib/navigation";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { LEARN_TITLE } from "./LearnHubPage";
import { useLearnProgress } from "./progress";
import { DoneMark, ProgressBar, StageBadge, formatMinutes, pageShell } from "./shared";

export function getLearnPathMetadata({ params }: RouteMetadataInput): PageMetadata {
	const { path: slug } = params as { path: string };
	const path = getLearnPath(slug);
	return buildMetadata({
		title: path ? `${path.title} path | ${LEARN_TITLE}` : LEARN_TITLE,
		description: path?.audience ?? "",
		path: `/learn/paths/${slug}`,
	});
}

export function LearnPathPage() {
	const { path: slug } = useParams({ from: "/{-$locale}/_dashboard/learn/paths/$path/" });
	const path = getLearnPath(slug);
	const { done } = useLearnProgress();
	if (!path) notFound();

	const lessons = pathLessons(path);
	const completed = lessons.filter((item) => done.has(item.ref)).length;
	const next = lessons.find((item) => !done.has(item.ref)) ?? lessons[0];

	// Group consecutive lessons by course, keeping path order.
	const groups: { title: string; slug: string; items: ResolvedLesson[] }[] = [];
	for (const item of lessons) {
		const last = groups.at(-1);
		if (last && last.slug === item.course.slug) last.items.push(item);
		else groups.push({ title: item.course.title, slug: item.course.slug, items: [item] });
	}

	let counter = 0;
	return (
		<div className={pageShell}>
			<nav className="mb-4 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
				<Link href="/learn" className="hover:text-zinc-900 dark:hover:text-zinc-100">
					{LEARN_TITLE}
				</Link>
				<ChevronRight className="size-4" />
				<span>Paths</span>
			</nav>

			<div className="max-w-3xl">
				<div className="text-sm text-zinc-500">
					Path · {lessons.length} lessons · about {formatMinutes(pathMinutes(path))}
				</div>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{path.title}</h1>
				<p className="mt-3 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{path.audience}</p>

				<div className="mt-6 flex flex-wrap items-center gap-4">
					{next ? (
						<Link href={lessonHref(next.ref)} className={buttonVariants({ size: "lg" })}>
							{completed === 0 ? "Start path" : completed === lessons.length ? "Review path" : "Continue"}
							<ArrowRight data-icon="inline-end" />
						</Link>
					) : null}
					<div className="min-w-48 flex-1">
						<div className="text-xs text-zinc-500">
							{completed} of {lessons.length} lessons complete
						</div>
						<ProgressBar className="mt-1.5" done={completed} total={lessons.length} />
					</div>
				</div>

				{groups.map((group) => (
					<section key={group.slug} className="mt-10">
						<Link href={`/learn/${group.slug}`} className="text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
							{group.title}
						</Link>
						<ol className="mt-2 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
							{group.items.map((item) => {
								counter += 1;
								return (
									<li key={item.ref}>
										<Link href={lessonHref(item.ref)} className="flex gap-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
											<span className="w-6 pt-0.5 text-right text-sm tabular-nums text-zinc-400">{counter}</span>
											<span className="flex-1">
												<span className="flex flex-wrap items-center gap-2 font-medium">
													{item.lesson.title}
													{item.lesson.stage ? <StageBadge stage={item.lesson.stage} link={false} /> : null}
												</span>
												<span className="mt-0.5 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">{item.lesson.summary}</span>
											</span>
											<span className="flex flex-col items-end gap-2 pt-0.5">
												<DoneMark done={done.has(item.ref)} />
												<span className="text-xs text-zinc-500">{item.lesson.minutes} min</span>
											</span>
										</Link>
									</li>
								);
							})}
						</ol>
					</section>
				))}
			</div>
		</div>
	);
}
