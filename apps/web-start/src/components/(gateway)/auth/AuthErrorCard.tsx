import Link from "next/link";
import type { ReactNode } from "react";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";

export function AuthErrorCard({
	heading,
	message,
	backToSignInLabel,
	locale = defaultLocale,
}: {
	heading: ReactNode;
	message: ReactNode;
	backToSignInLabel: ReactNode;
	locale?: PublicLocale;
}) {
	return (
		<div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
			<h1 className="text-lg font-semibold">{heading}</h1>
			<p className="mt-2 text-sm text-muted-foreground">{message}</p>
			<div className="mt-4">
				<Link
					className="text-sm underline underline-offset-4"
					href={localizeAuthPath(locale, "/sign-in")}
				>
					{backToSignInLabel}
				</Link>
			</div>
		</div>
	);
}
