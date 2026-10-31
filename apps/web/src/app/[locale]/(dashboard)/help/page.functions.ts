// The help centre reads src/content with node:fs, so it loads on the server.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { PublicLocale } from "@/i18n/routing";

export const getHelpCategoriesData = createServerFn({ method: "GET" })
	.validator((locale: PublicLocale) => locale)
	.handler(async ({ data: locale }) => {
		const { getLocalizedHelpCategories } = await import("@/lib/content/helpCenter");
		return getLocalizedHelpCategories(locale);
	});

export const getHelpCategoryData = createServerFn({ method: "GET" })
	.validator((input: { locale: PublicLocale; category: string }) => input)
	.handler(async ({ data: { locale, category } }) => {
		const { getLocalizedHelpCategory } = await import("@/lib/content/helpCenter");
		return (await getLocalizedHelpCategory(locale, category)) ?? null;
	});

export const getHelpArticleData = createServerFn({ method: "GET" })
	.validator((input: { locale: PublicLocale; category: string; slug: string }) => input)
	.handler(async ({ data: { locale, category, slug } }) => {
		const { getLocalizedHelpArticle, getLocalizedHelpCategory } = await import("@/lib/content/helpCenter");
		const [article, categoryData] = await Promise.all([
			getLocalizedHelpArticle(locale, category, slug),
			getLocalizedHelpCategory(locale, category),
		]);
		return { article: article ?? null, categoryData: categoryData ?? null };
	});

export const helpCategoriesQuery = (locale: PublicLocale) =>
	queryOptions({
		queryKey: ["help-center", "categories", locale],
		queryFn: () => getHelpCategoriesData({ data: locale }),
	});

export const helpCategoryQuery = (locale: PublicLocale, category: string) =>
	queryOptions({
		queryKey: ["help-center", "category", locale, category],
		queryFn: () => getHelpCategoryData({ data: { locale, category } }),
	});

export const helpArticleQuery = (locale: PublicLocale, category: string, slug: string) =>
	queryOptions({
		queryKey: ["help-center", "article", locale, category, slug],
		queryFn: () => getHelpArticleData({ data: { locale, category, slug } }),
	});
