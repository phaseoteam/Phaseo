import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trustLastReviewed } from "@/lib/trust-centre";
import { useTranslations } from "next-intl";

export function TrustDocument({
	title,
	description,
	status,
	children,
}: {
	title: string;
	description: string;
	status: string;
	children: ReactNode;
}) {
	const t = useTranslations("Site.trust");
	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
				<Link href="/trust" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
					<ArrowLeft className="size-4" /> {t("trustCentre")}
				</Link>
				<header className="mt-8 border-b border-border pb-8">
					<div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" /> {t("phaseoTrustCentre")}</div>
					<h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{title}</h1>
					<p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>
					<div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<Badge variant="outline" className="rounded-md font-normal">{status}</Badge>
						<span>{t("lastReviewed", { date: trustLastReviewed.display })}</span>
					</div>
				</header>
				<article className="trust-document mt-10 space-y-12 text-sm leading-7 text-muted-foreground">{children}</article>
				<footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
					<div className="flex flex-wrap gap-x-5 gap-y-2">
						<Link href="/trust" className="hover:text-foreground">{t("trustCentre")}</Link>
						<Link href="/privacy" className="hover:text-foreground">{t("privacyPolicy")}</Link>
						<Link href="/terms" className="hover:text-foreground">{t("termsOfService")}</Link>
					</div>
					<a href="mailto:privacy@phaseo.app" className="inline-flex items-center gap-1 hover:text-foreground">{t("privacyQuestions")} <ArrowUpRight className="size-3.5" /></a>
				</footer>
			</div>
		</main>
	);
}

export function TrustSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
	return (
		<section id={id} className="scroll-mt-24 space-y-3">
			<h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
			{children}
		</section>
	);
}

export function TrustCallout({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3">
			<p className="font-medium text-foreground">{title}</p>
			<div className="mt-1">{children}</div>
		</div>
	);
}

export function TrustTable({ children }: { children: ReactNode }) {
	return <div className="overflow-x-auto border-y border-border">{children}</div>;
}
