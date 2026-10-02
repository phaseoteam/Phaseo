import type { Metadata } from "next";
import {
	defaultLocale,
	publicLocales,
	type PublicLocale,
} from "@/i18n/routing";
import { localizeAuthPath, localizePublicPath } from "@/lib/auth/localized-paths";
import { openGraphLocales } from "@/lib/rootMetadata";
import { absoluteUrl, buildMetadata } from "@/lib/seo";

export function buildLocalizedAuthMetadata(input: {
	locale: PublicLocale;
	pathname: "/sign-in" | "/sign-up" | "/error";
	title: string;
	description: string;
}): Metadata {
	const localizedPath = localizeAuthPath(input.locale, input.pathname);
	const languageAlternates = Object.fromEntries(
		publicLocales.map((locale) => [
			locale,
			absoluteUrl(localizeAuthPath(locale, input.pathname)),
		]),
	);
	languageAlternates["x-default"] = absoluteUrl(
		localizeAuthPath(defaultLocale, input.pathname),
	);

	const metadata = buildMetadata({
		title: input.title,
		description: input.description,
		path: localizedPath,
		openGraph: {
			locale: openGraphLocales[input.locale],
			alternateLocale: publicLocales
				.filter((locale) => locale !== input.locale)
				.map((locale) => openGraphLocales[locale]),
		},
	});

	return {
		...metadata,
		alternates: {
			...metadata.alternates,
			canonical: absoluteUrl(localizedPath),
			languages: languageAlternates,
		},
		openGraph: {
			...metadata.openGraph,
			url: absoluteUrl(localizedPath),
		},
	};
}

export function buildLocalizedPageMetadata(input: {
	locale: PublicLocale;
	pathname: string;
	title: string;
	description: string;
	keywords?: string[];
	imagePath?: string;
	imageAlt?: string;
	robots?: Metadata["robots"];
	openGraph?: Metadata["openGraph"];
}): Metadata {
	const localizedPath = localizePublicPath(input.locale, input.pathname);
	const languageAlternates = Object.fromEntries(
		publicLocales.map((locale) => [
			locale,
			absoluteUrl(localizePublicPath(locale, input.pathname)),
		]),
	);
	languageAlternates["x-default"] = absoluteUrl(
		localizePublicPath(defaultLocale, input.pathname),
	);
	const metadata = buildMetadata({
		title: input.title,
		description: input.description,
		path: localizedPath,
		keywords: input.keywords,
		imagePath: input.imagePath,
		imageAlt: input.imageAlt,
		robots: input.robots,
		openGraph: {
			locale: openGraphLocales[input.locale],
			alternateLocale: publicLocales
				.filter((locale) => locale !== input.locale)
				.map((locale) => openGraphLocales[locale]),
			...input.openGraph,
		},
	});
	return {
		...metadata,
		alternates: {
			...metadata.alternates,
			canonical: absoluteUrl(localizedPath),
			languages: languageAlternates,
		},
		openGraph: {
			...metadata.openGraph,
			url: absoluteUrl(localizedPath),
		},
	};
}
