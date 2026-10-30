import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";
import { AuthErrorCard } from "@/components/(gateway)/auth/AuthErrorCard";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import {
	normalizeAuthErrorCode,
	normalizeAuthErrorMessage,
} from "@/lib/auth/errorMessage";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import AuthErrorMessage from "./AuthErrorMessage";

export type AuthErrorPageProps = {
	locale: PublicLocale;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function AuthErrorPage({ locale, searchParams }: AuthErrorPageProps) {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<AuthErrorPageContent locale={locale} searchParams={searchParams} />
		</Suspense>
	);
}

async function AuthErrorPageContent({ locale, searchParams }: AuthErrorPageProps) {
	const [t, shared] = await Promise.all([
		getTranslations({ locale, namespace: "Auth.error" }),
		getTranslations({ locale, namespace: "Auth.shared" }),
	]);
	const params = (await searchParams) ?? {};
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
