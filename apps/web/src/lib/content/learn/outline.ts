// Client-safe helpers over a localised outline. This file must not import course content.
import type { LearnCourse, LearnLesson, LearnPath } from "./types";

export type * from "./types";

// --- Outline: everything but lesson bodies, small enough for every page. ---

export type LearnLessonOutline = Pick<LearnLesson, "slug" | "title" | "summary" | "minutes" | "stage">;
export type LearnCourseOutline = Omit<LearnCourse, "lessons"> & { lessons: LearnLessonOutline[] };
export type LearnOutline = { courses: LearnCourseOutline[]; paths: LearnPath[] };

export function toOutline(catalog: { courses: LearnCourse[]; paths: LearnPath[] }): LearnOutline {
	return {
		paths: catalog.paths,
		courses: catalog.courses.map(({ lessons, ...course }) => ({
			...course,
			lessons: lessons.map(({ slug, title, summary, minutes, stage }) => ({
				slug,
				title,
				summary,
				minutes,
				...(stage ? { stage } : {}),
			})),
		})),
	};
}

export function getOutlineCourse(outline: LearnOutline, slug: string): LearnCourseOutline | undefined {
	return outline.courses.find((course) => course.slug === slug);
}

export function getOutlinePath(outline: LearnOutline, slug: string): LearnPath | undefined {
	return outline.paths.find((path) => path.slug === slug);
}

export type ResolvedOutlineLesson = { course: LearnCourseOutline; lesson: LearnLessonOutline; ref: string };

export function resolveOutlineLesson(outline: LearnOutline, ref: string): ResolvedOutlineLesson | undefined {
	const [courseSlug, lessonSlug] = ref.split("/");
	const course = getOutlineCourse(outline, courseSlug ?? "");
	const lesson = course?.lessons.find((item) => item.slug === lessonSlug);
	return course && lesson ? { course, lesson, ref } : undefined;
}

export function courseMinutes(course: { lessons: { minutes: number }[] }): number {
	return course.lessons.reduce((total, lesson) => total + lesson.minutes, 0);
}

export function pathLessons(outline: LearnOutline, path: LearnPath): ResolvedOutlineLesson[] {
	return path.lessons
		.map((ref) => resolveOutlineLesson(outline, ref))
		.filter((item): item is ResolvedOutlineLesson => Boolean(item));
}

export function pathMinutes(outline: LearnOutline, path: LearnPath): number {
	return pathLessons(outline, path).reduce((total, item) => total + item.lesson.minutes, 0);
}

/** Where a lesson sits in each path that includes it. */
export function lessonPathPositions(
	outline: LearnOutline,
	ref: string,
): { path: LearnPath; position: number; total: number }[] {
	return outline.paths.flatMap((path) => {
		const index = path.lessons.indexOf(ref);
		return index === -1 ? [] : [{ path, position: index + 1, total: path.lessons.length }];
	});
}

export function lessonHref(ref: string): string {
	return `/learn/${ref}`;
}

