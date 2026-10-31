import { use } from "react";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { notFound } from "@/lib/navigation";
import { SignInPage } from "@/app/(auth)/sign-in/SignInPage";
import { getPublicMessages } from "@/i18n/messages";
import { isPublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";

type LocalizedSignInPageProps = {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
	params,
}: LocalizedSignInPageProps): Promise<Metadata> {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	const messages = await getPublicMessages(locale);

	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/sign-in",
		title: messages.Auth.metadata.signInTitle,
		description: messages.Auth.metadata.signInDescription,
	});
}

export default function LocalizedSignInPage({
	params,
	searchParams,
}: LocalizedSignInPageProps) {
	const { locale } = use(params);
	if (!isPublicLocale(locale)) notFound();

	return <SignInPage locale={locale} searchParams={searchParams} />;
}
