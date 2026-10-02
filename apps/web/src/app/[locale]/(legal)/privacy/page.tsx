// app/privacy/page.tsx
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.legal" });
	return buildMetadata({ title: t("privacyTitle"), description: t("privacyIntro"), path: "/privacy", keywords: ["Phaseo privacy", "privacy policy", "data processing", "API privacy"] });
}

export default async function PrivacyPage() {
	const t = await getTranslations("Site.legal");
	const locale = await getLocale();
	const lastUpdatedDate = new Intl.DateTimeFormat(locale, {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date("2026-08-30T00:00:00Z"));
	const appliesItems = t.raw("privacyBody.appliesItems") as string[];
	const dataItems = t.raw("privacyBody.dataItems") as Array<{ label: string; text: string }>;
	const gatewayStorageItems = t.raw("privacyBody.gatewayStorageItems") as string[];
	const telemetryItems = t.raw("privacyBody.telemetryItems") as Array<{ label: string; text: string }>;
	const assistantItems = t.raw("privacyBody.assistantItems") as string[];
	const cookieItems = t.raw("privacyBody.cookieItems") as Array<{ label: string; text: string }>;
	const legalBasesItems = t.raw("privacyBody.legalBasesItems") as Array<{ label: string; text: string; basis: string }>;
	const sharingItems = t.raw("privacyBody.sharingItems") as Array<{ label: string; text: string }>;
	const transferMethods = t.raw("privacyBody.transferMethods") as string[];
	const retentionReasons = t.raw("privacyBody.retentionReasons") as string[];
	const retentionDetails = t.raw("privacyBody.retentionDetails") as string[];
	const rightsItems = t.raw("privacyBody.rightsItems") as Array<{ label: string; text: string }>;
	return (
		<main className="container mx-auto space-y-8 px-4 py-10 text-sm leading-relaxed text-muted-foreground">
			<header className="space-y-3">
				<p className="text-xs text-muted-foreground/80">
					{t("lastUpdated", { date: lastUpdatedDate })}
				</p>
				<h1 className="text-3xl font-semibold text-foreground">
					{t("privacyTitle")}
				</h1>
				<p className="text-foreground/80">
					{t("privacyIntro")}
				</p>

				<p className="text-foreground/80">
					{t.rich("privacyBody.notice", {
						terms: (chunks) => (
							<Link href="/terms" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>
				<p className="text-foreground/80">{t("privacyBody.consent")}</p>
			</header>

			<section aria-labelledby="privacy-scope">
				<h2
					id="privacy-scope"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.scope")}
				</h2>
				<p className="mt-2 text-foreground/80">
					{t.rich("privacyBody.controller", {
						person: (chunks) => <span className="font-medium">{chunks}</span>,
						brand: (chunks) => <span className="font-medium">{chunks}</span>,
						controller: (chunks) => <span className="font-medium">{chunks}</span>,
					})}
				</p>
				<p className="mt-2 text-foreground/80">
					{t("privacyBody.appliesIntro")}
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{appliesItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("privacyBody.providerRoles")}</p>
			</section>

			<section aria-labelledby="privacy-data-we-collect">
				<h2
					id="privacy-data-we-collect"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.dataCollected")}
				</h2>

				<h3 className="mt-3 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.provided")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.providedIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{dataItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
						</li>
					))}
				</ul>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.gatewayIO")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.gatewayIntro")}</p>
				<p className="mt-1 text-foreground/80">{t("privacyBody.gatewayStorageGoal")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{gatewayStorageItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">{t("privacyBody.sensitiveDataWarning")}</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.telemetry")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.telemetryIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{telemetryItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
						</li>
					))}
				</ul>
				<p className="mt-1 text-foreground/80">{t("privacyBody.telemetryUse")}</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.connectedAssistants")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.assistantIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{assistantItems.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-1 text-foreground/80">{t("privacyBody.assistantPrivacy")}</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.cookies")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.cookiesIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{cookieItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
						</li>
					))}
				</ul>
				<p className="mt-1 text-foreground/80">{t("privacyBody.cookieControl")}</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					{t("privacyHeadings.analytics")}
				</h3>
				<p className="mt-1 text-foreground/80">{t("privacyBody.analyticsIntro")}</p>
				<p className="mt-1 text-foreground/80">{t("privacyBody.analyticsDetails")}</p>
			</section>

			<section aria-labelledby="privacy-how-we-use">
				<h2
					id="privacy-how-we-use"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.legalBases")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.legalBasesIntro")}</p>
				<ul className="mt-2 list-disc space-y-2 pl-5 text-foreground/80">
					{legalBasesItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
							<br />
							<span className="text-xs text-foreground/70">{item.basis}</span>
						</li>
					))}
				</ul>
				<p className="mt-2 text-foreground/80">{t("privacyBody.aggregatedStats")}</p>
			</section>

			<section aria-labelledby="privacy-sharing">
				<h2
					id="privacy-sharing"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.sharing")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.sharingIntro")}</p>
				<ul className="mt-2 list-disc space-y-2 pl-5 text-foreground/80">
					{sharingItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="privacy-international">
				<h2
					id="privacy-international"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.transfers")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.transferIntro")}</p>
				<p className="mt-2 text-foreground/80">{t("privacyBody.transferOutsideIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{transferMethods.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
			</section>

			<section aria-labelledby="privacy-retention">
				<h2
					id="privacy-retention"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.retention")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.retentionIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{retentionReasons.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">{t("privacyBody.retentionDelete")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{retentionDetails.map((item, index) => <li key={index}>{item}</li>)}
				</ul>
				<p className="mt-2 text-foreground/80">
					{t.rich("privacyBody.retentionSchedule", {
						security: (chunks) => (
							<Link href="/trust/security" className="text-primary underline">
								{chunks}
							</Link>
						),
					})}
				</p>
				<p className="mt-2 text-foreground/80">{t("privacyBody.pluginRetention")}</p>
			</section>

			<section aria-labelledby="privacy-rights">
				<h2
					id="privacy-rights"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.rights")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.rightsIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					{rightsItems.map((item) => (
						<li key={item.label}>
							<strong>{item.label}</strong> – {item.text}
						</li>
					))}
				</ul>
				<p className="mt-2 text-foreground/80">
					{t.rich("privacyBody.rightsExercise", {
						email: (chunks) => (
							<a href="mailto:privacy@phaseo.app" className="text-primary underline">
								{chunks}
							</a>
						),
					})}
				</p>
				<p className="mt-2 text-foreground/80">{t("privacyBody.emailOptOut")}</p>
			</section>

			<section aria-labelledby="privacy-children">
				<h2
					id="privacy-children"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.children")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.children")}</p>
			</section>

			<section aria-labelledby="privacy-security">
				<h2
					id="privacy-security"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.security")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.securityMeasures")}</p>
				<p className="mt-2 text-foreground/80">
					{t.rich("privacyBody.securityLimits", {
						email: (chunks) => (
							<a href="mailto:support@phaseo.app" className="text-primary underline">
								{chunks}
							</a>
						),
					})}
				</p>
			</section>

			<section aria-labelledby="privacy-third-parties">
				<h2
					id="privacy-third-parties"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.thirdParties")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.thirdParties")}</p>
			</section>

			<section aria-labelledby="privacy-changes">
				<h2
					id="privacy-changes"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.changes")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.policyUpdates")}</p>
				<p className="mt-2 text-foreground/80">{t("privacyBody.continuedUse")}</p>
			</section>

			<section aria-labelledby="privacy-contact">
				<h2
					id="privacy-contact"
					className="text-xl font-semibold text-foreground/90"
				>
					{t("privacyHeadings.contact")}
				</h2>
				<p className="mt-2 text-foreground/80">{t("privacyBody.contactIntro")}</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						{t("privacyBody.emailLabel")}:{" "}
						<a
							href="mailto:privacy@phaseo.app"
							className="text-primary underline"
						>
							privacy@phaseo.app
						</a>
					</li>
					<li>
						{t("privacyBody.supportLabel")}:{" "}
						<a
							href="mailto:support@phaseo.app"
							className="text-primary underline"
						>
							support@phaseo.app
						</a>
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">{t("privacyBody.regulatorComplaint")}</p>
			</section>
		</main>
	);
}
