// components/(gateway)/auth/sign-up/SignUp.tsx
import { useState, type ElementType } from "react";
import { useTranslations } from "@/i18n/react";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";

export function SignUp({
	returnUrl,
	locale = defaultLocale,
	surface = "page",
	Heading = "h1",
}: {
	returnUrl?: string;
	locale?: PublicLocale;
	surface?: "page" | "dialog";
	/** The heading element; the dialog passes its title so it labels the dialog. */
	Heading?: ElementType;
}) {
	const t = useTranslations("Auth.signUp");
	const [emailFlowActive, setEmailFlowActive] = useState(false);

	return (
		<div
			className={`flex flex-col transition-[gap] duration-500 ease-out ${emailFlowActive ? "gap-3" : "gap-6"}`}
		>
			<div className="flex flex-col items-center gap-2 text-center">
				<Heading className="text-2xl font-bold">{t("heading")}</Heading>
			</div>

			<div
				className={`grid origin-top transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${emailFlowActive ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
				aria-hidden={emailFlowActive}
			>
				<div className="overflow-hidden">
					<OAuthButtons returnUrl={returnUrl} locale={locale} />
				</div>
			</div>

			<EmailPassword
				onEmailFlowChange={setEmailFlowActive}
				returnUrl={returnUrl}
				locale={locale}
				surface={surface}
			/>
		</div>
	);
}
