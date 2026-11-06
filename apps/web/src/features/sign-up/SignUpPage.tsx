import { useLocale, useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { AuthSuspenseFallback } from "@/features/auth/AuthSuspenseFallback";
import { AnalyticsIdentitySync } from "@/components/analytics/AnalyticsIdentitySync";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { SignUp } from "@/components/(gateway)/auth/sign-up/SignUp";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { getPublicMessages } from "@/i18n/messages";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";

export async function getSignUpMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = params.locale as PublicLocale;
	const messages = await getPublicMessages(locale);
	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/sign-up",
		title: messages.Auth.metadata.signUpTitle,
		description: messages.Auth.metadata.signUpDescription,
	});
}

export function SignUpPage() {
	return (
		<>
			{/* Whoever signs in or up here may be another account: drop a stale identified person. */}
			<AnalyticsIdentitySync userId={null} workspaceId={null} signedUpAt={null} />
			<Suspense fallback={<AuthSuspenseFallback />}>
				<SignUpPageContent />
			</Suspense>
		</>
	);
}

function SignUpPageContent() {
	const locale = useLocale() as PublicLocale;
	const shared = useTranslations("Auth.shared");
	const params = useSearch({ from: "/{-$locale}/_auth/sign-up/" }) as Record<string, string | string[] | undefined>;
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
