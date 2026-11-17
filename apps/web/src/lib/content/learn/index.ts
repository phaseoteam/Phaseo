import { adminsCourse } from "./courses/admins";
import { agentsCourse } from "./courses/agents";
import { buildFeaturesCourse } from "./courses/build-features";
import { conceptsCourse } from "./courses/concepts";
import { firstRequestCourse } from "./courses/first-request";
import { foundationsCourse } from "./courses/foundations";
import { routingCourse } from "./courses/routing";
import type { LearnCourse, LearnLesson, LearnLink, LearnPath } from "./types";

export type * from "./types";
export * from "./outline";

/** English is the source of truth for structure: slugs, order, answers, links, minutes, stages. */
export const LEARN_COURSES: LearnCourse[] = [
	foundationsCourse,
	agentsCourse,
	firstRequestCourse,
	routingCourse,
	buildFeaturesCourse,
	adminsCourse,
	conceptsCourse,
];

/** Which courses each path takes its lessons from, in order. */
export const LEARN_PATH_COURSES: Record<string, string[]> = {
	developers: ["what-is-phaseo", "make-your-first-request", "routing-and-presets", "build-real-features"],
	"agent-users": ["what-is-phaseo", "phaseo-in-your-coding-agent"],
	admins: ["what-is-phaseo", "set-up-your-team"],
};

export type LearnPathText = { title: string; audience: string };

export const LEARN_PATH_TEXT: Record<string, LearnPathText> = {
	developers: { title: "App developers", audience: "For people calling Phaseo from their own code." },
	"agent-users": {
		title: "Coding agent users",
		audience: "For people who build with Claude Code, Codex, Cursor or another coding agent.",
	},
	admins: { title: "Admins", audience: "For people who set Phaseo up for a team. No code needed." },
};

/** A translation of the course text. Only text fields are read from it. */
export type LearnTranslation = { courses: LearnCourse[]; paths: Record<string, LearnPathText> };

function mergeLinks(source: LearnLink[], translated: LearnLink[] | undefined): LearnLink[] {
	return source.map((link, index) => ({ href: link.href, label: translated?.[index]?.label || link.label }));
}

function mergeLesson(source: LearnLesson, translated: LearnLesson | undefined): LearnLesson {
	if (!translated) return source;
	const options =
		translated.quiz?.options?.length === source.quiz.options.length ? translated.quiz.options : source.quiz.options;
	return {
		...source,
		title: translated.title || source.title,
		summary: translated.summary || source.summary,
		body: translated.body || source.body,
		quiz: {
			question: translated.quiz?.question || source.quiz.question,
			options,
			answer: source.quiz.answer,
			explanation: translated.quiz?.explanation || source.quiz.explanation,
		},
		scenario: {
			prompt: translated.scenario?.prompt || source.scenario.prompt,
			answer: translated.scenario?.answer || source.scenario.answer,
		},
		takeaway: translated.takeaway || source.takeaway,
		links: mergeLinks(source.links, translated.links),
	};
}

/** Lays translated text over the English structure. Anything missing stays in English. */
export function mergeLearnTranslation(translation: LearnTranslation | null): {
	courses: LearnCourse[];
	paths: LearnPath[];
} {
	const courses = LEARN_COURSES.map((course) => {
		const translated = translation?.courses.find((item) => item.slug === course.slug);
		if (!translated) return course;
		return {
			...course,
			title: translated.title || course.title,
			summary: translated.summary || course.summary,
			format: translated.format || course.format,
			prerequisites:
				translated.prerequisites?.length === course.prerequisites.length ? translated.prerequisites : course.prerequisites,
			lessons: course.lessons.map((lesson) =>
				mergeLesson(lesson, translated.lessons.find((item) => item.slug === lesson.slug)),
			),
		};
	});
	const paths = Object.entries(LEARN_PATH_COURSES).map(([slug, courseSlugs]) => {
		const text = translation?.paths[slug] ?? LEARN_PATH_TEXT[slug] ?? { title: slug, audience: "" };
		return {
			slug,
			title: text.title,
			audience: text.audience,
			lessons: courseSlugs.flatMap((courseSlug) => {
				const course = LEARN_COURSES.find((item) => item.slug === courseSlug);
				return course ? course.lessons.map((lesson) => `${course.slug}/${lesson.slug}`) : [];
			}),
		};
	});
	return { courses, paths };
}


/** English structure check, for routes that 404 before loading text. */
export function learnLessonExists(courseSlug: string, lessonSlug: string): boolean {
	return Boolean(LEARN_COURSES.find((course) => course.slug === courseSlug)?.lessons.some((lesson) => lesson.slug === lessonSlug));
}

export function learnCourseExists(courseSlug: string): boolean {
	return LEARN_COURSES.some((course) => course.slug === courseSlug);
}

export function learnPathExists(pathSlug: string): boolean {
	return pathSlug in LEARN_PATH_COURSES;
}
