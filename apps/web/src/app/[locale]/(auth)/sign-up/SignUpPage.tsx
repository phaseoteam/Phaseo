import { useTranslations } from "next-intl";
import { Suspense, use } from "react";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";
import { AnalyticsIdentitySync } from "@/components/analytics/AnalyticsIdentitySync";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { SignUp } from "@/components/(gateway)/auth/sign-up/SignUp";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";

export type SignUpPageProps = {
	locale: PublicLocale;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function SignUpPage({ locale, searchParams }: SignUpPageProps) {
	return (
		<>
			{/* Whoever signs in or up here may be another account: drop a stale identified person. */}
			<AnalyticsIdentitySync userId={null} workspaceId={null} signedUpAt={null} />
			<Suspense fallback={<AuthSuspenseFallback />}>
				<SignUpPageContent locale={locale} searchParams={searchParams} />
			</Suspense>
		</>
	);
}

function SignUpPageContent({ locale, searchParams }: SignUpPageProps) {
	const shared = useTranslations("Auth.shared");
	const params = (searchParams ? use(searchParams) : undefined) ?? {};
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;
	const localeReturnPath = buildLocalizedAuthPath(defaultLocale, "/sign-up", {
		returnUrl,
	});

	return (
		<div className="min-h-svh">
			<div className="relative grid min-h-svh place-items-center p-6 md:p-10">
				<div className="absolute start-6 top-6 md:start-10 md:top-10">
					<AuthWordmark />
				</div>
				<LocaleSwitcher
					currentLocale={locale}
					returnPath={localeReturnPath}
					label={shared("changeLanguage")}
					className="absolute end-6 top-6 md:end-10 md:top-10"
				/>
				<div className="mx-auto w-full max-w-sm">
					<SignUp returnUrl={returnUrl} locale={locale} />
				</div>
			</div>
		</div>
	);
}
