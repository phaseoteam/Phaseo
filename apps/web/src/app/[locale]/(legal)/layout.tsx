import Link from "next/link";
import LegalHeaderShell from "@/components/header/LegalHeaderShell";
import LegalBackButton from "@/components/header/LegalBackButton";
import { getLocale, getTranslations } from "next-intl/server";
import { ScopedMessages } from "@/components/i18n/ScopedMessages";

export default async function LegalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = await getTranslations("Common.nav");
	const locale = await getLocale();
	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
				<LegalHeaderShell>
					<div className="flex w-full items-center justify-between gap-3">
						<ScopedMessages params={Promise.resolve({ locale })} namespaces={["Common.ui.actions.back"]}>
							<LegalBackButton />
						</ScopedMessages>
						<Link
							href="/"
							aria-label={`Phaseo ${t("home")}`}
							className="inline-flex items-center transition-opacity hover:opacity-80"
						>
							<img
								src="/wordmark_light.svg"
								alt="Phaseo"
								className="h-8 w-auto select-none dark:hidden"
								style={{ width: "auto" }}
							/>
							<img
								src="/wordmark_dark.svg"
								alt="Phaseo"
								className="hidden h-8 w-auto select-none dark:block"
								style={{ width: "auto" }}
							/>
						</Link>
					</div>
				</LegalHeaderShell>
			</header>
			{children}
		</div>
	);
}
