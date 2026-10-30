import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AuthErrorPage } from "@/app/(auth)/error/AuthErrorPage";
import { getPublicMessages } from "@/i18n/messages";
import { isPublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";

type LocalizedAuthErrorPageProps = {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
	params,
}: LocalizedAuthErrorPageProps): Promise<Metadata> {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	const messages = await getPublicMessages(locale);

	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/error",
		title: messages.Auth.error.heading,
		description: messages.Auth.error.default,
	});
}

export default async function LocalizedAuthErrorPage({
	params,
	searchParams,
}: LocalizedAuthErrorPageProps) {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	setRequestLocale(locale);

	return <AuthErrorPage locale={locale} searchParams={searchParams} />;
}
