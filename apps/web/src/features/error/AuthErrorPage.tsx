import { useLocale, useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { AuthSuspenseFallback } from "@/features/auth/AuthSuspenseFallback";
import { AuthErrorCard } from "@/components/(gateway)/auth/AuthErrorCard";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import {
	normalizeAuthErrorCode,
	normalizeAuthErrorMessage,
} from "@/lib/auth/errorMessage";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import AuthErrorMessage from "./AuthErrorMessage";
import { getPublicMessages } from "@/i18n/messages";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";

export async function getAuthErrorMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = params.locale as PublicLocale;
	const messages = await getPublicMessages(locale);
	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/error",
		title: messages.Auth.error.heading,
		description: messages.Auth.error.default,
	});
}

export function AuthErrorPage() {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<AuthErrorPageContent />
		</Suspense>
	);
}

function AuthErrorPageContent() {
	const locale = useLocale() as PublicLocale;
	const t = useTranslations("Auth.error");
	const shared = useTranslations("Auth.shared");
	const params = useSearch({ from: "/{-$locale}/_auth/error/" }) as Record<string, string | string[] | undefined>;
	const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
	const rawMessage = Array.isArray(params.message)
		? params.message[0]
		: params.message;
	const initialMessage = normalizeAuthErrorMessage(rawMessage);
	const localeReturnPath = buildLocalizedAuthPath(defaultLocale, "/error", {
		code: normalizeAuthErrorCode(rawCode),
	});

	return (
		<main className="relative flex min-h-screen items-center justify-center px-4">
			<LocaleSwitcher
				currentLocale={locale}
				returnPath={localeReturnPath}
				label={shared("changeLanguage")}
				className="absolute end-4 top-4 md:end-10 md:top-10"
			/>
			<AuthErrorCard
				heading={t("heading")}
				message={
					<AuthErrorMessage
						initialCode={rawCode}
						initialMessage={initialMessage}
					/>
				}
				backToSignInLabel={t("backToSignIn")}
				locale={locale}
			/>
		</main>
	);
}
