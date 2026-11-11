// Enterprise SSO in the auth dialog: the work email or domain, then the identity provider.
import type { ElementType } from "react";
import Link from "@/components/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "@/i18n/react";
import type { PublicLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleEnterpriseSsoRedirect } from "@/features/sign-in/actions";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";

function ContinueButton() {
	const { pending } = useFormStatus();
	const t = useTranslations("Common.authFlows.enterpriseSso");
	return (
		<Button type="submit" className="w-full" disabled={pending}>
			{t("continue")}
		</Button>
	);
}

export function SsoStep({
	returnUrl,
	locale,
	Heading,
}: {
	returnUrl?: string;
	locale: PublicLocale;
	Heading: ElementType;
}) {
	const t = useTranslations("Common.authFlows.enterpriseSso");

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-1.5 text-center">
				<Heading className="text-2xl font-bold">{t("title")}</Heading>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>

			<form action={(formData) => handleEnterpriseSsoRedirect({ data: formData })} className="grid gap-4">
				<input type="hidden" name="locale" value={locale} />
				{returnUrl ? <input type="hidden" name="returnUrl" value={returnUrl} /> : null}
				<div className="grid gap-2">
					<Label htmlFor="sso-domain">{t("emailOrDomain")}</Label>
					<Input
						id="sso-domain"
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
				<ContinueButton />
			</form>

			<div className="text-center text-sm">
				{/* Opens the sign-in step of this dialog (AuthDialog handles sign-in links). */}
				<Link href={buildLocalizedAuthPath(locale, "/sign-in", { returnUrl })} className="underline underline-offset-4">
					{t("backToStandardSignIn")}
				</Link>
			</div>
		</div>
	);
}
