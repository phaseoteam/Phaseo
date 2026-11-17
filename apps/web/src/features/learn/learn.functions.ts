// Course text loads on the server, one locale at a time, so it never ships in the client bundle.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { PublicLocale } from "@/i18n/routing";
import type { LearnLesson, LearnOutline } from "@/lib/content/learn/outline";

export const getLearnOutlineData = createServerFn({ method: "GET" })
	.validator((locale: PublicLocale) => locale)
	.handler(async ({ data: locale }): Promise<LearnOutline> => {
		const [{ loadLearnCatalog }, { toOutline }] = await Promise.all([
			import("@/lib/content/learn/catalog"),
			import("@/lib/content/learn/outline"),
		]);
		return toOutline(await loadLearnCatalog(locale));
	});

export const getLearnLessonData = createServerFn({ method: "GET" })
	.validator((input: { locale: PublicLocale; course: string; lesson: string }) => input)
	.handler(async ({ data }): Promise<LearnLesson | null> => {
		const { loadLearnLesson } = await import("@/lib/content/learn/catalog");
		return loadLearnLesson(data.locale, data.course, data.lesson);
	});

export const learnOutlineQuery = (locale: PublicLocale) =>
	queryOptions({
		queryKey: ["learn", "outline", locale],
		queryFn: () => getLearnOutlineData({ data: locale }),
		staleTime: Infinity,
	});

export const learnLessonQuery = (locale: PublicLocale, course: string, lesson: string) =>
	queryOptions({
		queryKey: ["learn", "lesson", locale, course, lesson],
		queryFn: () => getLearnLessonData({ data: { locale, course, lesson } }),
		staleTime: Infinity,
	});
