import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SignUpPage } from "@/app/(auth)/sign-up/SignUpPage";
import { getPublicMessages } from "@/i18n/messages";
import { isPublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";

type LocalizedSignUpPageProps = {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
	params,
}: LocalizedSignUpPageProps): Promise<Metadata> {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	const messages = await getPublicMessages(locale);

	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/sign-up",
		title: messages.Auth.metadata.signUpTitle,
		description: messages.Auth.metadata.signUpDescription,
	});
}

export default async function LocalizedSignUpPage({
	params,
	searchParams,
}: LocalizedSignUpPageProps) {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	setRequestLocale(locale);

	return <SignUpPage locale={locale} searchParams={searchParams} />;
}
