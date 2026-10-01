import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { TrustCallout, TrustDocument, TrustSection, TrustTable } from "@/components/trust/TrustDocument";
import type { PublicLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";

type FlowRow = { stage: string; data: string; handling: string };
type StorageOption = { title: string; description: string };
type ControlGroup = { title: string; items: string[] };
type MonitoringCopy = ControlGroup & { statusPublication: string; vulnerabilityReports: string };

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.securityPage" });

	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		keywords: t.raw("keywords" as never) as string[],
		path: "/trust/security",
	});
}

export default async function SecurityWhitepaperPage({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.securityPage" });
	const flowRows = t.raw("flow.rows" as never) as FlowRow[];
	const storageOptions = t.raw("storage.options" as never) as StorageOption[];
	const controlGroups = [
		t.raw("controls.transport" as never) as ControlGroup,
		t.raw("controls.identity" as never) as ControlGroup,
		t.raw("controls.safeguards" as never) as ControlGroup,
	];
	const monitoring = t.raw("controls.monitoring" as never) as MonitoringCopy;
	const developmentParagraphs = t.raw("development.paragraphs" as never) as string[];
	const availabilityParagraphs = t.raw("availability.paragraphs" as never) as string[];
	const responsibilities = t.raw("responsibilities.items" as never) as string[];
	const assuranceGaps = t.raw("gaps.items" as never) as string[];
	const listClass = "list-disc space-y-2 pl-5";

	return (
		<TrustDocument
			title={t("title")}
			description={t("description")}
			status={t("status")}
		>
			<TrustCallout title={t("assurance.title")}>
				{t("assurance.body")}
			</TrustCallout>

			<TrustSection id="scope" title={t("sections.scope")}>
				<p>{t("scope.introduction")}</p>
				<p>
					{t.rich("scope.services", {
						subprocessors: (chunks) => (
							<Link href="/trust/subprocessors" className="text-foreground underline underline-offset-4">
								{chunks}
							</Link>
						),
					})}
				</p>
			</TrustSection>

			<TrustSection id="flow" title={t("sections.flow")}>
				<TrustTable>
					<table className="w-full min-w-[720px] text-left">
						<thead>
							<tr className="border-b border-border text-xs text-muted-foreground">
								<th className="py-3 pr-4 font-medium">{t("flow.stage")}</th>
								<th className="py-3 pr-4 font-medium">{t("flow.data")}</th>
								<th className="py-3 font-medium">{t("flow.handling")}</th>
							</tr>
						</thead>
						<tbody className="align-top">
							{flowRows.map((row, index) => (
								<tr
									key={row.stage}
									className={index < flowRows.length - 1 ? "border-b border-border" : undefined}
								>
									<th className="py-4 pr-4 font-medium text-foreground">{row.stage}</th>
									<td className="py-4 pr-4">{row.data}</td>
									<td className="py-4">{row.handling}</td>
								</tr>
							))}
						</tbody>
					</table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="exceptions" title={t("sections.storage")}>
				<p>{t("storage.introduction")}</p>
				<ul className={listClass}>
					{storageOptions.map((option) => (
						<li key={option.title}>
							<span className="font-medium text-foreground">{option.title}:</span> {option.description}
						</li>
					))}
				</ul>
				<p>{t("storage.conclusion")}</p>
			</TrustSection>

			<TrustSection id="controls" title={t("sections.controls")}>
				<div className="grid gap-6 sm:grid-cols-2">
					{controlGroups.map((group) => (
						<div key={group.title}>
							<h3 className="font-medium text-foreground">{group.title}</h3>
							<ul className={`mt-2 ${listClass}`}>
								{group.items.map((item) => <li key={item}>{item}</li>)}
							</ul>
						</div>
					))}
					<div>
						<h3 className="font-medium text-foreground">{monitoring.title}</h3>
						<ul className={`mt-2 ${listClass}`}>
							{monitoring.items.map((item) => <li key={item}>{item}</li>)}
							<li>
								{t.rich("controls.monitoring.statusPublication", {
									status: (chunks) => <a href="https://status.phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
								})}
							</li>
							<li>
								{t.rich("controls.monitoring.vulnerabilityReports", {
									advisories: (chunks) => <a href="https://github.com/phaseoteam/Phaseo/security/advisories" className="text-foreground underline underline-offset-4">{chunks}</a>,
									email: (chunks) => <a href="mailto:security@phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
								})}
							</li>
						</ul>
					</div>
				</div>
			</TrustSection>

			<TrustSection id="development" title={t("sections.development")}>
				{developmentParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
			</TrustSection>

			<TrustSection id="availability" title={t("sections.availability")}>
				{availabilityParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
			</TrustSection>

			<TrustSection id="responsibility" title={t("sections.responsibilities")}>
				<ul className={listClass}>
					{responsibilities.map((item) => <li key={item}>{item}</li>)}
				</ul>
			</TrustSection>

			<TrustSection id="limitations" title={t("sections.gaps")}>
				<ul className={listClass}>
					{assuranceGaps.map((item) => <li key={item}>{item}</li>)}
				</ul>
			</TrustSection>

			<TrustSection id="contact" title={t("sections.contact")}>
				<p>
					{t.rich("contact.security", {
						email: (chunks) => <a href="mailto:security@phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
					})}{" "}
					{t.rich("contact.privacy", {
						email: (chunks) => <a href="mailto:privacy@phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
					})}
				</p>
			</TrustSection>
		</TrustDocument>
	);
}
