import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { handleEnterpriseSsoRedirect } from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSuspenseFallback } from "../../AuthSuspenseFallback";
import { samlSsoFlag } from "@/lib/flags";
import {
	buildLocalizedAuthPath,
	resolveAuthLocale,
} from "@/lib/auth/localized-paths";

type EnterpriseSignInPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Common.authFlows.enterpriseSso");
	return { title: "SSO | Phaseo", description: t("metaDescription") };
}

export default function EnterpriseSignInPage({
	searchParams,
}: EnterpriseSignInPageProps) {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<EnterpriseSignInPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function EnterpriseSignInPageContent({
	searchParams,
}: EnterpriseSignInPageProps) {
	const t = await getTranslations("Common.authFlows.enterpriseSso");
	if (!(await samlSsoFlag())) notFound();
	const params = (await searchParams) ?? {};
	const localeParam = Array.isArray(params.locale)
		? params.locale[0]
		: params.locale;
	const locale = resolveAuthLocale(localeParam);
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;

	return (
		<div className="grid min-h-svh place-items-center p-6 md:p-10">
			<div className="w-full max-w-sm space-y-6">
				<div className="space-y-2 text-center">
					<h1 className="text-2xl font-bold">{t("title")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("description")}
					</p>
				</div>

				<form action={handleEnterpriseSsoRedirect} className="grid gap-4">
					<input type="hidden" name="locale" value={locale} />
					{returnUrl ? (
						<input type="hidden" name="returnUrl" value={returnUrl} />
					) : null}
					<div className="grid gap-2">
						<Label htmlFor="domain">{t("emailOrDomain")}</Label>
						<Input
							id="domain"
							name="domain"
							type="text"
							dir="ltr"
							autoComplete="email"
							autoCapitalize="none"
							spellCheck={false}
							placeholder={t("emailDomainPlaceholder")}
							required
						/>
					</div>

					<Button type="submit" className="w-full">
						{t("continue")}
					</Button>
				</form>

				<div className="text-center text-sm">
					<Link
						href={buildLocalizedAuthPath(locale, "/sign-in", {
							returnUrl,
						})}
						className="underline underline-offset-4"
					>
						{t("backToStandardSignIn")}
					</Link>
				</div>
			</div>
		</div>
	);
}
