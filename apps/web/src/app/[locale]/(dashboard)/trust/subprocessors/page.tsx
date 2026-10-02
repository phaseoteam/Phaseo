import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { TrustCallout, TrustDocument, TrustSection, TrustTable } from "@/components/trust/TrustDocument";
import type { PublicLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";

type CoreProcessorId = "cloudflare" | "vercel" | "supabase" | "upstash" | "openai";
type OperationalProviderId =
	| "stripe"
	| "resend"
	| "statsig"
	| "googleAnalytics"
	| "vercelAnalytics"
	| "posthog"
	| "axiom"
	| "mintlify"
	| "incidentIo"
	| "tawkTo"
	| "notion"
	| "discord";

const coreProcessors: { id: CoreProcessorId; name: string }[] = [
	{ id: "cloudflare", name: "Cloudflare" },
	{ id: "vercel", name: "Vercel" },
	{ id: "supabase", name: "Supabase" },
	{ id: "upstash", name: "Upstash" },
	{ id: "openai", name: "OpenAI" },
];

const operationalProviders: { id: OperationalProviderId; name: string }[] = [
	{ id: "stripe", name: "Stripe" },
	{ id: "resend", name: "Resend" },
	{ id: "statsig", name: "Statsig" },
	{ id: "googleAnalytics", name: "Google Analytics" },
	{ id: "vercelAnalytics", name: "Vercel Web Analytics" },
	{ id: "posthog", name: "PostHog" },
	{ id: "axiom", name: "Axiom" },
	{ id: "mintlify", name: "Mintlify" },
	{ id: "incidentIo", name: "incident.io" },
	{ id: "tawkTo", name: "Tawk.to" },
	{ id: "notion", name: "Notion" },
	{ id: "discord", name: "Discord" },
];

const managedProcessorTerms = ["Amazon Web Services (Bedrock)", "Anthropic", "Google Cloud (Vertex AI)", "Groq", "Mistral AI", "OpenAI"] as const;
const managedPendingContract = ["AionLabs", "AkashML", "Alibaba Cloud", "AtlasCloud", "Baseten", "BytePlus", "Cerebras", "DeepInfra", "GMICloud", "Meta Model API", "Morph", "Nebius Token Factory", "NovitaAI", "SiliconFlow", "Venice", "Wafer", "Xiaomi", "z.AI"] as const;
const managedRestricted = ["Arcee AI", "Cohere", "DeepSeek", "ElevenLabs", "Fireworks AI", "Google AI Studio", "MiniMax", "Moonshot AI", "Poolside", "Sakana AI", "Together AI", "Voyage AI", "Weights & Biases"] as const;

type CoreProcessorCopy = { purpose: string; data: string; location: string; condition: string };
type OperationalProviderCopy = { role: string; data: string };

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.subprocessorsPage" });

	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		keywords: t.raw("keywords" as never) as string[],
		path: "/trust/subprocessors",
	});
}

export default async function SubprocessorsPage({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.trust.subprocessorsPage" });
	const coreCopy = t.raw("coreProcessors" as never) as Record<CoreProcessorId, CoreProcessorCopy>;
	const operationalCopy = t.raw("operationalProviders" as never) as Record<OperationalProviderId, OperationalProviderCopy>;
	const changeDate = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date("2026-08-30T00:00:00.000Z"));

	return (
		<TrustDocument
			title={t("title")}
			description={t("description")}
			status={t("status")}
		>
			<TrustCallout title={t("calloutTitle")}>
				{t("calloutBody")}
			</TrustCallout>

			<TrustSection id="core" title={t("sections.core")}>
				<TrustTable>
					<table className="w-full min-w-[960px] text-left">
						<thead>
							<tr className="border-b border-border text-xs">
								<th className="py-3 pr-4 font-medium">{t("headers.provider")}</th>
								<th className="py-3 pr-4 font-medium">{t("headers.purpose")}</th>
								<th className="py-3 pr-4 font-medium">{t("headers.data")}</th>
								<th className="py-3 pr-4 font-medium">{t("headers.location")}</th>
								<th className="py-3 font-medium">{t("headers.whenUsed")}</th>
							</tr>
						</thead>
						<tbody className="align-top">
							{coreProcessors.map((provider) => {
								const copy = coreCopy[provider.id];
								return (
									<tr key={provider.id} className="border-b border-border last:border-0">
										<th className="py-4 pr-4 font-medium text-foreground">{provider.name}</th>
										<td className="py-4 pr-4">{copy.purpose}</td>
										<td className="py-4 pr-4">{copy.data}</td>
										<td className="py-4 pr-4">{copy.location}</td>
										<td className="py-4">{copy.condition}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="managed-ai" title={t("sections.managedAi")}>
				<p>{t("managedAi.introduction", { date: changeDate })}</p>
				<div className="grid gap-6 lg:grid-cols-3">
					<div>
						<h3 className="font-medium text-foreground">{t("managedAi.termsHeading")}</h3>
						<p className="mt-2">{t("managedAi.termsBody")}</p>
						<ul className="mt-3 list-disc space-y-1 pl-5">
							{managedProcessorTerms.map((name) => <li key={name}>{name}</li>)}
						</ul>
					</div>
					<div>
						<h3 className="font-medium text-foreground">{t("managedAi.pendingHeading")}</h3>
						<p className="mt-2">{t("managedAi.pendingBody")}</p>
						<ul className="mt-3 list-disc space-y-1 pl-5">
							{managedPendingContract.map((name) => <li key={name}>{name}</li>)}
						</ul>
					</div>
					<div>
						<h3 className="font-medium text-foreground">{t("managedAi.restrictedHeading")}</h3>
						<p className="mt-2">{t("managedAi.restrictedBody")}</p>
						<ul className="mt-3 list-disc space-y-1 pl-5">
							{managedRestricted.map((name) => <li key={name}>{name}</li>)}
						</ul>
					</div>
				</div>
				<p>{t("managedAi.conclusion")}</p>
			</TrustSection>

			<TrustSection id="ai" title={t("sections.customerAi")}>
				<p>
					{t.rich("customerAi.directory", {
						directory: (chunks) => <Link href="/api-providers" className="text-foreground underline underline-offset-4">{chunks}</Link>,
					})}
				</p>
				<p>{t("customerAi.ownAccount")}</p>
			</TrustSection>

			<TrustSection id="operations" title={t("sections.operations")}>
				<p>{t("operations.introduction")}</p>
				<TrustTable>
					<table className="w-full min-w-[720px] text-left">
						<thead>
							<tr className="border-b border-border text-xs">
								<th className="py-3 pr-4 font-medium">{t("headers.provider")}</th>
								<th className="py-3 pr-4 font-medium">{t("headers.role")}</th>
								<th className="py-3 font-medium">{t("headers.data")}</th>
							</tr>
						</thead>
						<tbody className="align-top">
							{operationalProviders.map((provider) => {
								const copy = operationalCopy[provider.id];
								return (
									<tr key={provider.id} className="border-b border-border last:border-0">
										<th className="py-4 pr-4 font-medium text-foreground">{provider.name}</th>
										<td className="py-4 pr-4">{copy.role}</td>
										<td className="py-4">{copy.data}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="customer" title={t("sections.destinations")}>
				<p>{t("customerDestinations.introduction")}</p>
			</TrustSection>

			<TrustSection id="changes" title={t("sections.changes")}>
				<p>{t("changes.introduction")}</p>
				<p>
					{t.rich("changes.contact", {
						email: (chunks) => <a href="mailto:privacy@phaseo.app" className="text-foreground underline underline-offset-4">{chunks}</a>,
					})}
				</p>
			</TrustSection>

			<TrustSection id="history" title={t("sections.history")}>
				<dl className="grid gap-2 border-y border-border py-4 sm:grid-cols-[10rem_1fr]">
					<dt className="font-medium text-foreground">{changeDate}</dt>
					<dd>{t("history.initialEntry")}</dd>
				</dl>
			</TrustSection>
		</TrustDocument>
	);
}
