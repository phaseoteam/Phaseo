import type { Metadata } from "next";
import { getPublicMessages } from "@/i18n/messages";
import type { PublicLocale } from "@/i18n/routing";
import {
	METADATA_BASE,
	PREFERRED_SITE_NAME,
	SITE_NAME,
	absoluteUrl,
} from "@/lib/seo";

export const openGraphLocales = {
	"en-GB": "en_GB",
	"en-US": "en_US",
	"zh-Hans": "zh_CN",
	hi: "hi_IN",
	"es-ES": "es_ES",
	"fr-FR": "fr_FR",
	"de-DE": "de_DE",
	"pt-BR": "pt_BR",
	ja: "ja_JP",
	"ar-SA": "ar_SA",
} as const satisfies Record<PublicLocale, string>;

const rootTitle = "Phaseo: The AI Gateway for Every Model and Provider";
const rootDescription =
	"Discover and compare the world's most comprehensive AI model database and gateway. Browse benchmarks, features, pricing, and access state-of-the-art AI models.";
const socialDescription =
	"Browse and compare state-of-the-art AI models, benchmarks, features, and pricing.";

const sharedRootMetadata: Metadata = {
	title: {
		default: rootTitle,
		template: `%s | ${SITE_NAME}`,
	},
	description: rootDescription,
	applicationName: PREFERRED_SITE_NAME,
	authors: [{ name: SITE_NAME }],
	other: {
		"google-adsense-account": "ca-pub-5904826500425921",
	},
	metadataBase: METADATA_BASE,
	twitter: {
		card: "summary_large_image",
		site: "@phaseoteam",
		creator: "@DanielButler001",
		title: rootTitle,
		description: socialDescription,
		images: [absoluteUrl("/og.png")],
	},
};

export const siteRootMetadata: Metadata = {
	...sharedRootMetadata,
	openGraph: {
		type: "website",
		locale: openGraphLocales["en-GB"],
		siteName: PREFERRED_SITE_NAME,
		url: absoluteUrl("/"),
		title: rootTitle,
		description: socialDescription,
		images: [
			{
				url: absoluteUrl("/og.png"),
				width: 1200,
				height: 630,
				alt: "Phaseo - Browse and compare AI models",
			},
		],
	},
};

export async function buildLocalizedRootMetadata(
	locale: PublicLocale,
): Promise<Metadata> {
	const messages = await getPublicMessages(locale);
	const title = messages.Site.home.title;
	const description = messages.Site.home.description;

	return {
		...sharedRootMetadata,
		title: {
			default: title,
			template: `%s | ${SITE_NAME}`,
		},
		description,
		twitter: {
			...sharedRootMetadata.twitter,
			title,
			description,
		},
		openGraph: {
			type: "website",
			locale: openGraphLocales[locale],
			alternateLocale: Object.entries(openGraphLocales)
				.filter(([candidate]) => candidate !== locale)
				.map(([, openGraphLocale]) => openGraphLocale),
			siteName: PREFERRED_SITE_NAME,
			title,
			description,
			images: [
				{
					url: absoluteUrl("/og.png"),
					width: 1200,
					height: 630,
					alt: title,
				},
			],
		},
	};
}
