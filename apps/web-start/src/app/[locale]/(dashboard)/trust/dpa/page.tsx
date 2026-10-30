/* eslint-disable react/no-unescaped-entities -- Contract prose uses natural apostrophes. */
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
import { TrustCallout, TrustDocument, TrustSection, TrustTable } from "@/components/trust/TrustDocument";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.dpaPage" });

	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		keywords: t.raw("keywords" as never) as string[],
		path: "/trust/dpa",
	});
}

const clauses = "list-decimal space-y-3 pl-5";
const bullets = "list-disc space-y-2 pl-5";
const reviewText = "text-amber-700 dark:text-amber-300";

type DpaContent = {
	parties: {
		introduction: string;
		customer: string;
		phaseo: string;
		effectiveDate: string;
		conflict: string;
	};
	definitions: { term: string; definition: string }[];
	scope: string[];
	scopeIndependentController: string;
	customerResponsibilities: string[];
	confidentiality: string[];
	subprocessorsIntroduction: string;
	subprocessorsClauses: string[];
	assistance: string[];
	breach: string[];
	transfers: string[];
	deletion: string[];
	audit: string[];
	term: string[];
	annex1: { label: string; value: string }[];
	annex2: string[];
	annex2Summary: string;
	annex3Introduction: string;
	annex3Review: string;
	annex4: string;
	sourcesIntroduction: string;
	sourceLinks: string[];
	signature: {
		customer: string;
		phaseoParty: string;
		customerFields: string[];
		phaseoNameLabel: string;
		phaseoName: string;
		capacityLabel: string;
		capacity: string;
		signatureLabel: string;
		dateLabel: string;
		insertPlaceholder: string;
	};
};

export default async function DpaPage({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.dpaPage" });
	const content = t.raw("content" as never) as DpaContent;
	const sectionTitles = {
		parties: t("sections.parties"),
		definitions: t("sections.definitions"),
		scope: t("sections.scope"),
		customer: t("sections.customer"),
		confidentiality: t("sections.confidentiality"),
		subprocessors: t("sections.subprocessors"),
		assistance: t("sections.assistance"),
		breach: t("sections.breach"),
		transfers: t("sections.transfers"),
		deletion: t("sections.deletion"),
		audit: t("sections.audit"),
		term: t("sections.term"),
		annex1: t("sections.annex1"),
		annex2: t("sections.annex2"),
		annex3: t("sections.annex3"),
		annex4: t("sections.annex4"),
		sources: t("sections.sources"),
		signature: t("sections.signature"),
	};

	return (
		<TrustDocument
			title={t("title")}
			description={t("description")}
			status={t("status")}
		>
			<TrustCallout title={t("calloutTitle")}>
				{t.rich("calloutBody", {
					email: (chunks) => <a href="mailto:privacy@phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
				})}
			</TrustCallout>

		<TrustSection id="parties" title={sectionTitles.parties}>
				<p>{t.rich("content.parties.introduction", {
					dpa: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
					agreement: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
				})}</p>
				<ul className={bullets}>
					<li>{t.rich("content.parties.customer", { customer: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</li>
					<li>{t.rich("content.parties.phaseo", { phaseo: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</li>
				</ul>
				<p>{t.rich("content.parties.effectiveDate", { effectiveDate: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</p>
				<p>{content.parties.conflict}</p>
			</TrustSection>

			<TrustSection id="definitions" title={sectionTitles.definitions}>
				<ul className={bullets}>
					{content.definitions.map(({ term, definition }) => (
						<li key={term}><span className="font-medium text-foreground">{term}</span> {definition}</li>
					))}
				</ul>
			</TrustSection>

			<TrustSection id="scope" title={sectionTitles.scope}>
				<ol className={clauses}>
					{content.scope.map((item, index) => <li key={index}>{item}</li>)}
					<li>{t.rich("content.scopeIndependentController", {
						privacyPolicy: (chunks) => <Link href="/privacy" className="text-foreground underline underline-offset-4">{chunks}</Link>,
					})}</li>
				</ol>
			</TrustSection>

			<TrustSection id="customer" title={sectionTitles.customer}>
				<ol className={clauses}>
					{content.customerResponsibilities.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="confidentiality" title={sectionTitles.confidentiality}>
				<ol className={clauses}>
					{content.confidentiality.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="subprocessors" title={sectionTitles.subprocessors}>
				<ol className={clauses}>
					<li>{t.rich("content.subprocessorsIntroduction", {
						subprocessorSchedule: (chunks) => <Link href="/trust/subprocessors" className="text-foreground underline underline-offset-4">{chunks}</Link>,
					})}</li>
					{content.subprocessorsClauses.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="assistance" title={sectionTitles.assistance}>
				<ol className={clauses}>
					{content.assistance.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="breach" title={sectionTitles.breach}>
				<ol className={clauses}>
					{content.breach.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="transfers" title={sectionTitles.transfers}>
				<ol className={clauses}>
					{content.transfers.map((item, index) => <li key={index} className={index === 4 ? reviewText : undefined}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="deletion" title={sectionTitles.deletion}>
				<ol className={clauses}>
					{content.deletion.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="audit" title={sectionTitles.audit}>
				<ol className={clauses}>
					{content.audit.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="term" title={sectionTitles.term}>
				<ol className={clauses}>
					{content.term.map((item, index) => <li key={index}>{item}</li>)}
				</ol>
			</TrustSection>

			<TrustSection id="annex-1" title={sectionTitles.annex1}>
				<TrustTable>
					<table className="w-full min-w-[720px] text-left"><tbody className="align-top">
						{content.annex1.map((row, index) => <tr key={row.label} className={index < content.annex1.length - 1 ? "border-b border-border" : undefined}><th className="w-56 py-4 pr-4 font-medium text-foreground">{row.label}</th><td className="py-4">{row.value}</td></tr>)}
					</tbody></table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="annex-2" title={sectionTitles.annex2}>
				<ul className={bullets}>
					{content.annex2.slice(0, 5).map((item, index) => <li key={index}>{item}</li>)}
					<li>{t.rich("content.annex2Security", {
						securityWhitepaper: (chunks) => <Link href="/trust/security" className="text-foreground underline underline-offset-4">{chunks}</Link>,
					})}</li>
					{content.annex2.slice(5).map((item, index) => <li key={index + 5}>{item}</li>)}
				</ul>
				<p>{content.annex2Summary}</p>
			</TrustSection>

			<TrustSection id="annex-3" title={sectionTitles.annex3}>
				<p>{t.rich("content.annex3Introduction", {
					subprocessorSchedule: (chunks) => <Link href="/trust/subprocessors" className="text-foreground underline underline-offset-4">{chunks}</Link>,
				})}</p>
				<p className={reviewText}>{content.annex3Review}</p>
			</TrustSection>

			<TrustSection id="annex-4" title={sectionTitles.annex4}>
				<p className={reviewText}>{content.annex4}</p>
			</TrustSection>

			<TrustSection id="sources" title={sectionTitles.sources}>
				<p>{content.sourcesIntroduction}</p>
				<ul className={bullets}>
					<li><a href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/" className="text-foreground underline underline-offset-4">{content.sourceLinks[0]}</a></li>
					<li><a href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/" className="text-foreground underline underline-offset-4">{content.sourceLinks[1]}</a></li>
					<li><a href="https://commission.europa.eu/publications/standard-contractual-clauses-controllers-and-processors-eueea_en" className="text-foreground underline underline-offset-4">{content.sourceLinks[2]}</a></li>
				</ul>
			</TrustSection>

			<TrustSection id="signature" title={sectionTitles.signature}>
				<TrustTable>
					<table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-border"><th className="py-3 pr-8 font-medium text-foreground">{content.signature.customer}</th><th className="py-3 font-medium text-foreground">{content.signature.phaseoParty}</th></tr></thead><tbody><tr><td className="py-4 pr-8">{content.signature.customerFields.map((label) => <div key={label}>{label}: {content.signature.insertPlaceholder}</div>)}</td><td className="py-4"><div>{content.signature.phaseoNameLabel}: {content.signature.phaseoName}</div><div>{content.signature.capacityLabel}: {content.signature.capacity}</div><div>{content.signature.signatureLabel}: {content.signature.insertPlaceholder}</div><div>{content.signature.dateLabel}: {content.signature.insertPlaceholder}</div></td></tr></tbody></table>
				</TrustTable>
			</TrustSection>
		</TrustDocument>
	);
}
