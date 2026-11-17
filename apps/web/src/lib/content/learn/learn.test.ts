import { describe, expect, it } from "vitest";
import { LEARN_COURSES, LEARN_PATH_COURSES, type LearnTranslation } from "./index";
import { loadLearnCatalog } from "./catalog";
import arSA from "./locales/ar-SA";
import deDE from "./locales/de-DE";
import esES from "./locales/es-ES";
import frFR from "./locales/fr-FR";
import hi from "./locales/hi";
import ja from "./locales/ja";
import ptBR from "./locales/pt-BR";
import zhHans from "./locales/zh-Hans";

const TRANSLATIONS: Record<string, LearnTranslation> = {
	"ar-SA": arSA,
	"de-DE": deDE,
	"es-ES": esES,
	"fr-FR": frFR,
	hi,
	ja,
	"pt-BR": ptBR,
	"zh-Hans": zhHans,
};

// `text` blocks hold prose for the reader to paste (the agent prompt), so they are translated.
const codeBlocks = (markdown: string) =>
	(markdown.match(/```[\s\S]*?```/g) ?? []).filter((block) => !block.startsWith("```text"));

describe("Learn course content", () => {
	it("has unique course and lesson slugs", () => {
		const courseSlugs = LEARN_COURSES.map((course) => course.slug);
		expect(new Set(courseSlugs).size).toBe(courseSlugs.length);
		for (const course of LEARN_COURSES) {
			const lessonSlugs = course.lessons.map((lesson) => lesson.slug);
			expect(new Set(lessonSlugs).size, course.slug).toBe(lessonSlugs.length);
		}
	});

	it("gives every lesson a valid quiz, scenario, takeaway and links", () => {
		for (const course of LEARN_COURSES) {
			for (const lesson of course.lessons) {
				const where = `${course.slug}/${lesson.slug}`;
				expect(lesson.quiz.options.length, where).toBe(3);
				expect(Number.isInteger(lesson.quiz.answer), where).toBe(true);
				expect(lesson.quiz.answer, where).toBeGreaterThanOrEqual(0);
				expect(lesson.quiz.answer, where).toBeLessThan(lesson.quiz.options.length);
				expect(new Set(lesson.quiz.options).size, where).toBe(lesson.quiz.options.length);
				expect(lesson.scenario.prompt && lesson.scenario.answer && lesson.takeaway, where).toBeTruthy();
				expect(lesson.minutes, where).toBeGreaterThan(0);
				expect(lesson.updated, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				expect(lesson.links.length, where).toBeGreaterThan(0);
				for (const link of lesson.links) {
					expect(link.href, where).toMatch(/^(https:\/\/phaseo\.app\/|\/)/);
				}
			}
		}
	});

	it("builds every path from real courses", () => {
		for (const [path, courses] of Object.entries(LEARN_PATH_COURSES)) {
			for (const slug of courses) {
				expect(LEARN_COURSES.some((course) => course.slug === slug), `${path} → ${slug}`).toBe(true);
			}
		}
	});

	describe.each(Object.entries(TRANSLATIONS))("%s translation", (locale, translation) => {
		it("translates every course, lesson and path", () => {
			expect(Object.keys(translation.paths).sort()).toEqual(Object.keys(LEARN_PATH_COURSES).sort());
			for (const source of LEARN_COURSES) {
				const course = translation.courses.find((item) => item.slug === source.slug);
				expect(course, source.slug).toBeDefined();
				expect(course?.lessons.map((lesson) => lesson.slug)).toEqual(source.lessons.map((lesson) => lesson.slug));
			}
		});

		it("keeps quiz options, links and code blocks aligned with English", () => {
			for (const source of LEARN_COURSES) {
				const course = translation.courses.find((item) => item.slug === source.slug);
				for (const sourceLesson of source.lessons) {
					const lesson = course?.lessons.find((item) => item.slug === sourceLesson.slug);
					const where = `${locale} ${source.slug}/${sourceLesson.slug}`;
					expect(lesson?.quiz.options.length, where).toBe(sourceLesson.quiz.options.length);
					expect(lesson?.links.map((link) => link.href), where).toEqual(sourceLesson.links.map((link) => link.href));
					expect(codeBlocks(lesson?.body ?? ""), where).toEqual(codeBlocks(sourceLesson.body));
					expect(lesson?.body, where).not.toBe(sourceLesson.body);
				}
			}
		});

		it("loads merged, with English answers", async () => {
			const catalog = await loadLearnCatalog(locale as Parameters<typeof loadLearnCatalog>[0]);
			for (const source of LEARN_COURSES) {
				const course = catalog.courses.find((item) => item.slug === source.slug);
				source.lessons.forEach((sourceLesson, index) => {
					expect(course?.lessons[index]?.quiz.answer).toBe(sourceLesson.quiz.answer);
				});
			}
		});
	});
});
