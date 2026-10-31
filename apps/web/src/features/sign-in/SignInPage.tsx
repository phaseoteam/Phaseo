import { useLocale, useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AuthSuspenseFallback } from "@/features/auth/AuthSuspenseFallback";
import { AnalyticsIdentitySync } from "@/components/analytics/AnalyticsIdentitySync";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { Login } from "@/components/(gateway)/auth/Login";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { samlSsoEnabledQuery } from "./SignInPage.functions";
import { getPublicMessages } from "@/i18n/messages";
import { buildLocalizedAuthMetadata } from "@/lib/auth/localized-metadata";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";

export async function getSignInMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = params.locale as PublicLocale;
	const messages = await getPublicMessages(locale);
	return buildLocalizedAuthMetadata({
		locale,
		pathname: "/sign-in",
		title: messages.Auth.metadata.signInTitle,
		description: messages.Auth.metadata.signInDescription,
	});
}

export function SignInPage() {
	return (
		<>
			{/* Whoever signs in or up here may be another account: drop a stale identified person. */}
			<AnalyticsIdentitySync userId={null} workspaceId={null} signedUpAt={null} />
			<Suspense fallback={<AuthSuspenseFallback />}>
				<SignInPageContent />
			</Suspense>
		</>
	);
}

function SignInPageContent() {
	const locale = useLocale() as PublicLocale;
	const { data: ssoEnabled } = useSuspenseQuery(samlSsoEnabledQuery());
	const shared = useTranslations("Auth.shared");
	const params = useSearch({ from: "/{-$locale}/_auth/sign-in/" }) as Record<string, string | string[] | undefined>;
	const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
	const signupNotice =
		signup === "exists" || signup === "check-email" ? "check-email" : null;
	const authErrorParam = Array.isArray(params.error)
		? params.error[0]
		: params.error;
	const authError = authErrorParam === "auth-failed" ? "auth-failed" : null;
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;
	const localeReturnPath = buildLocalizedAuthPath(defaultLocale, "/sign-in", {
		returnUrl,
		signup: signupNotice ?? undefined,
		error: authError ?? undefined,
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
					<Login
						signupNotice={signupNotice}
						authError={authError}
						returnUrl={returnUrl}
						ssoEnabled={ssoEnabled}
						locale={locale}
					/>
				</div>
			</div>
		</div>
	);
}
