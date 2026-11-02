import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScopedMessages, type ScopedLayoutProps } from "@/components/i18n/ScopedMessages";
import { WorkNav } from "@/components/work/WorkNav";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work");
	return { title: { template: `%s - ${t("metaTitle")}`, default: t("metaTitle") }, robots: { index: false, follow: false } };
}

// Internal only: every page under /work calls requireInternalAdmin itself.
export default async function WorkLayout({ children, params }: ScopedLayoutProps) {
	const t = await getTranslations("Work");
	return (
		<ScopedMessages params={params} namespaces={["Work"]}>
			<div className="container mx-auto flex w-full flex-col gap-5 px-4 py-6">
				<header className="space-y-3">
					<div className="flex items-baseline gap-3">
						<h1 className="text-lg font-semibold">{t("metaTitle")}</h1>
						<span className="text-xs text-muted-foreground">{t("common.internalOnly")}</span>
					</div>
					<WorkNav />
				</header>
				{children}
			</div>
		</ScopedMessages>
	);
}
