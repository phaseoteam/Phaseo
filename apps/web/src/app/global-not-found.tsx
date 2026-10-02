import "./globals.css";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { RootDocument } from "@/components/layout/RootDocument";
import { getPublicMessages } from "@/i18n/messages";
import { defaultLocale, getLocaleDefinition, isPublicLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

// Unknown routes have no locale params; their complete document uses the
// negotiated request locale, including language, direction and cookie copy.
export const instant = false;

async function getNotFoundLocale() {
	const candidate = (await headers()).get("x-next-intl-locale");
	return isPublicLocale(candidate) ? candidate : defaultLocale;
}

export async function generateMetadata() {
	const messages = await getPublicMessages(await getNotFoundLocale());
	return { title: messages.Common.errors.notFoundTitle, robots: { index: false, follow: false } };
}

export default async function GlobalNotFound() {
	const locale = await getNotFoundLocale();
	const messages = await getPublicMessages(locale);
	const copy = messages.Common.errors;
	const definition = getLocaleDefinition(locale);
	const prefix = locale === defaultLocale ? "" : `/${locale}`;
	return (
		<RootDocument
			cookieConsentCopy={messages.CookieConsent}
			locale={locale}
			direction={definition.dir}
			fontProfile={definition.font}
			messages={messages}
		>
			<main className="flex min-h-dvh items-center justify-center px-4 py-16 sm:px-6">
				<div className="text-center">
					<h1 className="text-2xl font-semibold tracking-tight">
						{copy.notFoundTitle}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{copy.notFoundDescription}
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
						<Button asChild variant="outline">
							<Link href={prefix || "/"}>
								<ArrowLeft className="size-4" aria-hidden="true" />
								{copy.goHome}
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href={`${prefix}/models`}>
								{copy.browseModels}
								<ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</Button>
					</div>
				</div>
			</main>
		</RootDocument>
	);
}
