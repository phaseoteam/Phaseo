import { adminsCourse } from "./courses/admins";
import { agentsCourse } from "./courses/agents";
import { firstRequestCourse } from "./courses/first-request";
import { foundationsCourse } from "./courses/foundations";
import { routingCourse } from "./courses/routing";
import type { LearnCourse, LearnLesson, LearnPath } from "./types";

export type * from "./types";

export const LEARN_COURSES: LearnCourse[] = [
	foundationsCourse,
	agentsCourse,
	firstRequestCourse,
	routingCourse,
	adminsCourse,
];

const lessonRefs = (course: LearnCourse) => course.lessons.map((lesson) => `${course.slug}/${lesson.slug}`);

export const LEARN_PATHS: LearnPath[] = [
	{
		slug: "developers",
		title: "App developers",
		audience: "For people calling Phaseo from their own code.",
		lessons: [...lessonRefs(foundationsCourse), ...lessonRefs(firstRequestCourse), ...lessonRefs(routingCourse)],
	},
	{
		slug: "agent-users",
		title: "Coding agent users",
		audience: "For people who build with Claude Code, Codex, Cursor or another coding agent.",
		lessons: [...lessonRefs(foundationsCourse), ...lessonRefs(agentsCourse)],
	},
	{
		slug: "admins",
		title: "Admins",
		audience: "For people who set Phaseo up for a team. No code needed.",
		lessons: [...lessonRefs(foundationsCourse), ...lessonRefs(adminsCourse)],
	},
];

/** The prompt a learner pastes into a coding agent to start the agent-taught course. */
export const LEARN_AGENT_PROMPT =
	"Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.";

export const LEVEL_LABELS: Record<LearnCourse["level"], string> = {
	beginner: "Beginner",
	developer: "Developer",
	admin: "Admin",
};

export function getLearnCourse(slug: string): LearnCourse | undefined {
	return LEARN_COURSES.find((course) => course.slug === slug);
}

export function getLearnPath(slug: string): LearnPath | undefined {
	return LEARN_PATHS.find((path) => path.slug === slug);
}

export type ResolvedLesson = { course: LearnCourse; lesson: LearnLesson; ref: string };

export function resolveLessonRef(ref: string): ResolvedLesson | undefined {
	const [courseSlug, lessonSlug] = ref.split("/");
	const course = getLearnCourse(courseSlug ?? "");
	const lesson = course?.lessons.find((item) => item.slug === lessonSlug);
	return course && lesson ? { course, lesson, ref } : undefined;
}

export function getLearnLesson(courseSlug: string, lessonSlug: string): ResolvedLesson | undefined {
	return resolveLessonRef(`${courseSlug}/${lessonSlug}`);
}

export function courseMinutes(course: LearnCourse): number {
	return course.lessons.reduce((total, lesson) => total + lesson.minutes, 0);
}

export function pathLessons(path: LearnPath): ResolvedLesson[] {
	return path.lessons.map(resolveLessonRef).filter((item): item is ResolvedLesson => Boolean(item));
}

export function pathMinutes(path: LearnPath): number {
	return pathLessons(path).reduce((total, item) => total + item.lesson.minutes, 0);
}

/** Where a lesson sits in each path that includes it, e.g. "Admins · 4 of 9". */
export function lessonPathPositions(ref: string): { path: LearnPath; position: number; total: number }[] {
	return LEARN_PATHS.flatMap((path) => {
		const index = path.lessons.indexOf(ref);
		return index === -1 ? [] : [{ path, position: index + 1, total: path.lessons.length }];
	});
}

export function lessonHref(ref: string): string {
	return `/learn/${ref}`;
}
