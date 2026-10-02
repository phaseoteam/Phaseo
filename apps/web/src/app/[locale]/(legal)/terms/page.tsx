// app/terms/page.tsx
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.legal" });
	return buildMetadata({ title: t("termsTitle"), description: t("termsIntro"), path: "/terms", keywords: ["Phaseo terms", "terms of service", "API usage terms", "gateway terms"] });
}

export default async function TermsPage() {
	const t = await getTranslations("Site.legal");
	const locale = await getLocale();
	const lastUpdatedDate = new Intl.DateTimeFormat(locale, {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date("2026-08-30T00:00:00Z"));
	const serviceFeatures = t.raw("termsBody.features") as string[];
	const accountResponsibilities = t.raw("termsBody.accountResponsibilities") as string[];
	const autoTopUpActions = t.raw("termsBody.autoTopUpActions") as string[];
	const refundRules = t.raw("termsBody.refundRules") as string[];
	const contentOwnershipConditions = t.raw("termsBody.contentOwnershipConditions") as string[];
	const contentTelemetryItems = t.raw("termsBody.contentTelemetryItems") as string[];
	const userResponsibilityItems = t.raw("termsBody.userResponsibilityItems") as string[];
	const prohibitedActions = t.raw("termsBody.prohibitedActions") as string[];
	const suspensionConditions = t.raw("termsBody.suspensionConditions") as string[];
	const indemnityItems = t.raw("termsBody.indemnityItems") as string[];
	const disclaimerItems = t.raw("termsBody.disclaimerItems") as string[];
	const liabilityExceptions = t.raw("termsBody.liabilityExceptions") as string[];
	const liabilityCaps = t.raw("termsBody.liabilityCaps") as string[];
	return (
		<main className="container mx-auto space-y-8 px-4 py-10 text-sm leading-relaxed text-muted-foreground">
			<header className="space-y-3">
				<p className="text-xs text-muted-foreground/80">
					{t("lastUpdated", { date: lastUpdatedDate })}
				</p>
				<h1 className="text-3xl font-semibold text-foreground">
					{t("termsTitle")}
				</h1>
				<p className="text-sm text-foreground/80">
					{t("termsIntro")}
				</p>
				<p className="text-sm text-foreground/80">
					{t.rich("termsBody.operator", {
						person: (chunks) => <span className="font-medium">{chunks}</span>,
						brand: (chunks) => <span className="font-medium">{chunks}</span>,
					})}
				</p>
				<p className="text-sm text-foreground/80">
					{t.rich("termsBody.acceptance", {
						privacy: (chunks) => (
							<Link href="/privacy" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>
			</header>

			<section aria-labelledby="section-1">
				<h2
					id="section-1"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.serviceOverview")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.serviceIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{serviceFeatures.map((feature, index) => <li key={index}>{feature}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.availability")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.changeNotice")}</p>
			</section>

			<section aria-labelledby="section-2">
				<h2
					id="section-2"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.eligibilityAccounts")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.accountAge")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.accountBusiness")}</p>
				<p className="mt-2 text-foreground/80">
					{t.rich("termsBody.accountRegistration", {
						privacy: (chunks) => (
							<Link href="/privacy" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.accountResponsibilitiesIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{accountResponsibilities.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">
					{t.rich("termsBody.accountCompromise", {
						email: (chunks) => (
							<a href="mailto:support@phaseo.app" className="text-primary underline">
								{chunks}
							</a>
						),
					})}
				</p>
			</section>

			<section aria-labelledby="section-3">
				<h2
					id="section-3"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.feesCreditsPayment")}
				</h2>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.creditsWallet")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.credits")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.creditsPurchase")}</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.paymentProcessing")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.paymentProcessing")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.cardStorage")}</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.autoTopUp")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.autoTopUpIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{autoTopUpActions.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">{t("termsBody.autoTopUpCard")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.autoTopUpSecurity")}</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.refundsExpiry")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.refundIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{refundRules.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">
					{t.rich("termsBody.refundRequest", {
						email: (chunks) => (
							<a href="mailto:support@phaseo.app" className="text-primary underline">
								{chunks}
							</a>
						),
					})}
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.pricingChanges")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.pricingChanges")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.billingCorrections")}</p>
			</section>

			<section aria-labelledby="section-4">
				<h2
					id="section-4"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.content")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.contentIntro")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.contentOwnershipIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{contentOwnershipConditions.map((item, index) => <li key={index}>{item}</li>)}
				</ul>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.handling")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.contentHandling")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.contentTelemetryIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{contentTelemetryItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">
					{t.rich("termsBody.contentTelemetryUse", {
						privacy: (chunks) => (
							<Link href="/privacy" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.providerTerms")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.providerTermsIntro")}</p>
				<p className="mt-1 text-foreground/80">{t("termsBody.providerTermsResponsibility")}</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					{t("termsHeadings.userResponsibilities")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("termsBody.userResponsibilityIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{userResponsibilityItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">{t("termsBody.contentModeration")}</p>
			</section>

			<section aria-labelledby="section-5">
				<h2
					id="section-5"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.prohibitedUse")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.prohibitedIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{prohibitedActions.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
			</section>

			<section aria-labelledby="section-6">
				<h2
					id="section-6"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.suspensionTermination")}
				</h2>
				<p className="mt-2 text-foreground/80">
					{t.rich("termsBody.accountClosure", {
						email: (chunks) => (
							<a href="mailto:support@phaseo.app" className="text-primary underline">
								{chunks}
							</a>
						),
					})}
				</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.suspensionIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{suspensionConditions.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.suspensionNotice")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.suspensionRefund")}</p>
			</section>

			<section aria-labelledby="section-7">
				<h2
					id="section-7"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.privacy")}
				</h2>
				<p className="mt-2 text-foreground/80">
					{t.rich("termsBody.privacyClause", {
						privacy: (chunks) => (
							<Link href="/privacy" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>
			</section>

			<section aria-labelledby="section-8">
				<h2
					id="section-8"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.changes")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.serviceImprovements")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.termsUpdates")}</p>
			</section>

			<section aria-labelledby="section-9">
				<h2
					id="section-9"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.intellectualProperty")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.ipOwnership")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.openSourceLicense")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.trademarks")}</p>
			</section>

			<section aria-labelledby="section-10">
				<h2
					id="section-10"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.feedback")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.feedback")}</p>
			</section>

			<section aria-labelledby="section-11">
				<h2
					id="section-11"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.indemnity")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.indemnityIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{indemnityItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.consumerIndemnity")}</p>
			</section>

			<section aria-labelledby="section-12">
				<h2
					id="section-12"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.disclaimers")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.disclaimerIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{disclaimerItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.aiGenerated")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.catalogAccuracy")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.mandatoryRights")}</p>
			</section>

			<section aria-labelledby="section-13">
				<h2
					id="section-13"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.liability")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.liabilityIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{liabilityExceptions.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.liabilityLimitIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						{t("termsBody.liabilityLoss")}
					</li>
					<li>
						{t("termsBody.liabilityCapIntro")}
						<ul className="mt-1 list-[circle] space-y-1 pl-5">
							{liabilityCaps.map((item, index) => <li key={index}>{item}</li>)}
						</ul>
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">{t("termsBody.liabilityPricing")}</p>
			</section>

			<section aria-labelledby="section-14">
				<h2
					id="section-14"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.governingLaw")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.governingLawIntro")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.businessCourt")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.consumerCourt")}</p>
			</section>

			<section aria-labelledby="section-15">
				<h2
					id="section-15"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.general")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("termsBody.severability")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.assignment")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.waiver")}</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.survival")}</p>
			</section>

			<section aria-labelledby="section-16">
				<h2
					id="section-16"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("termsHeadings.contact")}
				</h2>
				<p className="mt-2 text-foreground/80">
					{t.rich("termsBody.operatorDetails", {
						person: (chunks) => <span className="font-medium">{chunks}</span>,
						brand: (chunks) => <span className="font-medium">{chunks}</span>,
					})}
				</p>
				<p className="mt-2 text-foreground/80">{t("termsBody.contactQuestions")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						{t("termsBody.contactEmailLabel")}:{" "}
						<a
							href="mailto:support@phaseo.app"
							className="text-primary underline"
						>
							support@phaseo.app
						</a>
					</li>
				</ul>
			</section>
		</main>
	);
}
