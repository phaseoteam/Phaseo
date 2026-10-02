import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { ArrowUpRight, Check, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import {
	trustLastReviewed,
	type TrustState,
} from "@/lib/trust-centre";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.trust" });
	return buildMetadata({ title: t("trustCentre"), description: t("currentSafeguards"), path: "/trust", keywords: ["Phaseo security", "Phaseo trust centre", "Phaseo privacy", "Phaseo subprocessors"] });
}

const stateStyles: Record<TrustState, string> = {
	available: "border-emerald-600/25 bg-emerald-500/7 text-emerald-700 dark:text-emerald-300",
	gated: "border-amber-600/25 bg-amber-500/7 text-amber-700 dark:text-amber-300",
	"self-attested": "border-sky-600/25 bg-sky-500/7 text-sky-700 dark:text-sky-300",
	planned: "border-violet-600/25 bg-violet-500/7 text-violet-700 dark:text-violet-300",
	"independently-certified": "border-border bg-muted/40 text-muted-foreground",
};

type TrustOverview = {
	states: Array<{ id: TrustState; label: string; description: string }>;
	documents: Array<{ id: "security" | "subprocessors" | "dpa"; title: string; description: string; status: string }>;
	securityPractices: Array<{ id: string; title: string; description: string; state: TrustState }>;
	dataPractices: Array<{ id: string; title: string; description: string; state: TrustState }>;
	providers: Array<{ id: string; name: string; purpose: string; data: string }>;
	unclaimed: string[];
	assuranceSummary: string;
	providerHeader: string;
	purposeHeader: string;
	dataHeader: string;
	subprocessorNoteLead: string;
	scheduleText: string;
	subprocessorNoteTail: string;
	serviceStatus: string;
	serviceStatusBodyLead: string;
	statusLinkText: string;
	serviceStatusBodyTail: string;
	incidentResponse: string;
	incidentResponseBody: string;
	complianceBody: string;
	responsibleDisclosureBody: string;
	contact: string;
};

function StateBadge({ state, states }: { state: TrustState; states: TrustOverview["states"] }) {
	const label = states.find((item) => item.id === state)?.label ?? state;
	return <Badge variant="outline" className={`rounded-md font-normal ${stateStyles[state]}`}>{label}</Badge>;
}

function PracticeList({ items, states }: { items: TrustOverview["securityPractices"]; states: TrustOverview["states"] }) {
	return (
		<div className="border-t border-border">
			{items.map((item) => (
				<article key={item.title} className="grid gap-2 border-b border-border py-5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-8">
					<div>
						<h3 className="text-sm font-medium text-foreground">{item.title}</h3>
						<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{item.description}</p>
					</div>
					<div className="sm:text-right"><StateBadge state={item.state} states={states} /></div>
				</article>
			))}
		</div>
	);
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
	return <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-foreground">{children}<ArrowUpRight className="size-3.5" /></Link>;
}

export default async function TrustCentrePage() {
	const t = await getTranslations("Site.trust");
	const locale = await getLocale();
	const copy: TrustOverview = {
		states: t.raw("overview.states") as TrustOverview["states"],
		documents: t.raw("overview.documents") as TrustOverview["documents"],
		securityPractices: t.raw("overview.securityPractices") as TrustOverview["securityPractices"],
		dataPractices: t.raw("overview.dataPractices") as TrustOverview["dataPractices"],
		providers: t.raw("overview.providers") as TrustOverview["providers"],
		unclaimed: t.raw("overview.unclaimed") as TrustOverview["unclaimed"],
		assuranceSummary: t("overview.assuranceSummary"),
		providerHeader: t("overview.providerHeader"),
		purposeHeader: t("overview.purposeHeader"),
		dataHeader: t("overview.dataHeader"),
		subprocessorNoteLead: t("overview.subprocessorNoteLead"),
		scheduleText: t("overview.scheduleText"),
		subprocessorNoteTail: t("overview.subprocessorNoteTail"),
		serviceStatus: t("overview.serviceStatus"),
		serviceStatusBodyLead: t("overview.serviceStatusBodyLead"),
		statusLinkText: t("overview.statusLinkText"),
		serviceStatusBodyTail: t("overview.serviceStatusBodyTail"),
		incidentResponse: t("overview.incidentResponse"),
		incidentResponseBody: t("overview.incidentResponseBody"),
		complianceBody: t("overview.complianceBody"),
		responsibleDisclosureBody: t("overview.responsibleDisclosureBody"),
		contact: t("overview.contact"),
	};
	const reviewDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${trustLastReviewed.iso}T00:00:00Z`));
	const sectionLinks = [
		["documents", t("trustDocuments")],
		["security", t("security")],
		["data", t("dataHandling")],
		["providers", t("serviceProviders")],
		["availability", t("availability")],
		["compliance", t("compliance")],
		["disclosure", t("responsibleDisclosure")],
	] as const;
	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto w-full max-w-[1120px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
				<header className="border-b border-border pb-10">
					<div className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="size-4" /> {t("phaseoTrustCentre")}</div>
					<div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
						<div>
							<h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">{t("securityAndTrust")}</h1>
							<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{t("currentSafeguards")}</p>
						</div>
						<dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-l border-border pl-5 text-sm lg:grid-cols-1">
							<div><dt className="text-xs text-muted-foreground">{t("assurance")}</dt><dd className="mt-1"><StateBadge state="self-attested" states={copy.states} /></dd></div>
							<div><dt className="sr-only">{t("assurance")}</dt><dd className="mt-1 text-xs font-medium">{t("lastReviewed", { date: reviewDate })}</dd></div>
						</dl>
					</div>
				</header>

				<div className="grid gap-12 pt-10 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
					<aside className="lg:sticky lg:top-24 lg:self-start">
						<nav aria-label={t("sections")} className="border-l border-border">
							{sectionLinks.map(([id, label]) => <Link key={id} href={`#${id}`} className="block border-l border-transparent py-1.5 pl-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground">{label}</Link>)}
						</nav>
						<div className="mt-8 border-t border-border pt-5">
							<h2 className="text-xs font-medium text-foreground">{t("claimLabels")}</h2>
							<dl className="mt-3 space-y-3">
								{copy.states.map((state) => <div key={state.id}><dt><StateBadge state={state.id} states={copy.states} /></dt><dd className="mt-1 text-xs leading-5 text-muted-foreground">{state.description}</dd></div>)}
							</dl>
							<p className="mt-5 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">{copy.assuranceSummary}</p>
						</div>
					</aside>

					<div className="min-w-0 space-y-16">
						<section id="documents" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("trustDocuments")}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{t("trustDocumentsBody")}</p>
							<div className="mt-6 grid gap-3 sm:grid-cols-3">
								{copy.documents.map((document) => (
									<Link key={document.id} href={`/trust/${document.id}`} className="group border border-border p-4 transition-colors hover:border-foreground/40">
										<div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium text-foreground">{document.title}</h3><ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
										<p className="mt-2 text-xs leading-5 text-muted-foreground">{document.description}</p>
										<p className="mt-4 text-xs font-medium text-foreground">{document.status}</p>
									</Link>
								))}
							</div>
						</section>

						<section id="security" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("security")}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{t("securityBody")}</p>
							<div className="mt-6"><PracticeList items={copy.securityPractices} states={copy.states} /></div>
						</section>

						<section id="data" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("dataHandling")}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{t("dataHandlingBody")}</p>
							<div className="mt-6"><PracticeList items={copy.dataPractices} states={copy.states} /></div>
						</section>

						<section id="providers" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("serviceProviders")}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{t("serviceProvidersBody")}</p>
							<div className="mt-6 overflow-x-auto border-y border-border">
								<table className="w-full min-w-[640px] table-fixed text-left">
									<colgroup><col className="w-40" /><col className="w-48" /><col /></colgroup>
									<thead><tr className="border-b border-border text-xs font-medium text-muted-foreground"><th scope="col" className="py-3 pr-4 font-medium">{copy.providerHeader}</th><th scope="col" className="py-3 pr-4 font-medium">{copy.purposeHeader}</th><th scope="col" className="py-3 font-medium">{copy.dataHeader}</th></tr></thead>
									<tbody>{copy.providers.map((provider) => <tr key={provider.id} className="border-b border-border last:border-0"><th scope="row" className="py-4 pr-4 align-top text-sm font-medium">{provider.name}</th><td className="py-4 pr-4 align-top text-sm text-muted-foreground">{provider.purpose}</td><td className="py-4 align-top text-sm leading-6 text-muted-foreground">{provider.data}</td></tr>)}</tbody>
								</table>
							</div>
							<p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.subprocessorNoteLead}<Link href="/trust/subprocessors" className="underline underline-offset-4">{copy.scheduleText}</Link>{copy.subprocessorNoteTail}</p>
						</section>

						<section id="availability" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("availability")}</h2>
							<div className="mt-6 border-y border-border">
								<div className="grid gap-2 border-b border-border py-5 sm:grid-cols-[10rem_1fr]"><h3 className="text-sm font-medium">{copy.serviceStatus}</h3><p className="text-sm leading-6 text-muted-foreground">{copy.serviceStatusBodyLead}<ExternalLink href="https://status.phaseo.app">{copy.statusLinkText}</ExternalLink>{copy.serviceStatusBodyTail}</p></div>
								<div className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]"><h3 className="text-sm font-medium">{copy.incidentResponse}</h3><p className="text-sm leading-6 text-muted-foreground">{copy.incidentResponseBody}</p></div>
							</div>
						</section>

						<section id="compliance" className="scroll-mt-24">
							<h2 className="text-xl font-semibold tracking-tight">{t("compliance")}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.complianceBody}</p>
							<ul className="mt-6 border-y border-border">{copy.unclaimed.map((claim) => <li key={claim} className="flex gap-3 border-b border-border py-3 text-sm leading-6 text-muted-foreground last:border-0"><span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-foreground" />{claim}</li>)}</ul>
						</section>

						<section id="disclosure" className="scroll-mt-24 border-t border-border pt-8">
							<h2 className="text-xl font-semibold tracking-tight">{t("responsibleDisclosure")}</h2>
							<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.responsibleDisclosureBody}</p>
							<div className="mt-5 flex flex-col gap-2 sm:flex-row">
								<Button asChild><Link href="mailto:security@phaseo.app"><KeyRound className="mr-2 size-4" />{t("emailSecurity")}</Link></Button>
								<Button asChild variant="outline"><Link href="https://github.com/phaseoteam/Phaseo/security/advisories/new" target="_blank" rel="noopener noreferrer">{t("privateGithubReport")}<ArrowUpRight className="ml-2 size-4" /></Link></Button>
							</div>
						</section>
					</div>
				</div>

				<footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
					<div className="flex flex-wrap gap-x-5 gap-y-2"><Link href="/privacy" className="hover:text-foreground">{t("privacyPolicy")}</Link><Link href="/terms" className="hover:text-foreground">{t("termsOfService")}</Link><Link href="/contact" className="hover:text-foreground">{copy.contact}</Link></div>
					<span className="inline-flex items-center gap-1.5"><Check className="size-3.5" /> {t("reviewedEvidence")}</span>
				</footer>
			</div>
		</main>
	);
}
