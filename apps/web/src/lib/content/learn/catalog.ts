// Server-side: loads one locale's course text and lays it over the English structure.
import type { PublicLocale } from "@/i18n/routing";
import { type LearnTranslation, mergeLearnTranslation } from "./index";
import type { LearnCourse, LearnLesson, LearnPath } from "./types";

type Catalog = { courses: LearnCourse[]; paths: LearnPath[] };

const TRANSLATIONS: Partial<Record<PublicLocale, () => Promise<{ default: LearnTranslation }>>> = {
	"ar-SA": () => import("./locales/ar-SA"),
	"de-DE": () => import("./locales/de-DE"),
	"es-ES": () => import("./locales/es-ES"),
	"fr-FR": () => import("./locales/fr-FR"),
	hi: () => import("./locales/hi"),
	ja: () => import("./locales/ja"),
	"pt-BR": () => import("./locales/pt-BR"),
	"zh-Hans": () => import("./locales/zh-Hans"),
};

const cache = new Map<string, Promise<Catalog>>();

export function loadLearnCatalog(locale: PublicLocale): Promise<Catalog> {
	const key = TRANSLATIONS[locale] ? locale : "en";
	let entry = cache.get(key);
	if (!entry) {
		const load = TRANSLATIONS[locale];
		entry = (load ? load().then((mod) => mod.default) : Promise.resolve(null)).then(mergeLearnTranslation);
		cache.set(key, entry);
	}
	return entry;
}

export async function loadLearnLesson(
	locale: PublicLocale,
	courseSlug: string,
	lessonSlug: string,
): Promise<LearnLesson | null> {
	const { courses } = await loadLearnCatalog(locale);
	return courses.find((course) => course.slug === courseSlug)?.lessons.find((lesson) => lesson.slug === lessonSlug) ?? null;
}
