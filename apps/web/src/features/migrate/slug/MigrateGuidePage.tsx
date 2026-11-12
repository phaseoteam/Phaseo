import { useParams } from "@tanstack/react-router";
import { useTranslations, useLocale } from "@/i18n/react";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { notFound } from "@/lib/navigation";
import { MigrationPostView } from "@/components/(migrate)/MigrationPostView";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { getMigrationPost } from "@/lib/content/migrations";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";

export async function getMigrateGuideMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale, slug } = params as { locale: PublicLocale; slug: string };
	const t = await getTranslations({ locale, namespace: "Content.migrate" });
	const post = getMigrationPost(slug, locale);
	const path = `/migrate/${slug}`;

	if (!post) {
		return buildMetadata({
			title: t("title"),
			description: t("description"),
			path,
		});
	}

	return buildMetadata({
		title: post.seoTitle,
		description: post.description,
		path,
		keywords: post.keywords,
	});
}

export function MigrateGuidePage() {
	const locale = useLocale() as PublicLocale;
	const { slug } = useParams({ from: "/{-$locale}/_dashboard/migrate/$slug/" });
	const t = useTranslations("Content.migrate");
	const tNav = useTranslations("Common.nav");
	const post = getMigrationPost(slug, locale);

	if (!post) {
		notFound();
	}

	const pageUrl = absoluteUrl(`/migrate/${post.slug}`);
	const howTo = {
		"@context": "https://schema.org",
		"@type": "HowTo",
		name: post.title,
		description: post.description,
		url: pageUrl,
		dateModified: post.updatedAt,
		step: post.sections
			.filter((section) => /^\d/.test(section.title))
			.map((section, index) => ({
				"@type": "HowToStep",
				position: index + 1,
				name: section.title,
				text: section.paragraphs.join(" "),
				url: `${pageUrl}#${section.id}`,
			})),
	};
	const faq = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: post.faq.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	};
	const breadcrumbs = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: tNav("home"), item: absoluteUrl("/") },
			{ "@type": "ListItem", position: 2, name: t("title"), item: absoluteUrl("/migrate") },
			{ "@type": "ListItem", position: 3, name: post.sourceLabel, item: pageUrl },
		],
	};

	return (
		<>
			<JsonLdScript id={`migration-howto-${post.slug}`} data={howTo} />
			<JsonLdScript id={`migration-faq-${post.slug}`} data={faq} />
			<JsonLdScript id={`migration-breadcrumbs-${post.slug}`} data={breadcrumbs} />
			<MigrationPostView post={post} locale={locale} />
		</>
	);
}
