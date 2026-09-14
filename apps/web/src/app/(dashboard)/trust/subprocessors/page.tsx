/* eslint-disable react/no-unescaped-entities -- Vendor and legal prose uses natural apostrophes. */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustCallout, TrustDocument, TrustSection, TrustTable } from "@/components/trust/TrustDocument";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Subprocessors",
	description: "Review the infrastructure, AI processing, and other third parties Phaseo uses to deliver the service.",
	path: "/trust/subprocessors",
	keywords: ["Phaseo subprocessors", "Phaseo service providers", "AI gateway subprocessors"],
});

const coreProcessors = [
	{ name: "Cloudflare", purpose: "Public edge, DNS, Gateway Worker execution, logs, KV, Durable Objects, and private R2 object storage", data: "Network and request data; gateway content in transit; optional I/O logs and data contributions; operational metadata", location: "Workers execute on Cloudflare's global network. Phaseo's private R2 buckets are located in Western Europe (WEUR); they do not currently have an EU jurisdictional restriction.", condition: "Core" },
	{ name: "Vercel", purpose: "Host and deliver the Phaseo web application", data: "Website and dashboard traffic, account-facing requests, device and operational metadata", location: "Global delivery network; deployment processing locations require factual confirmation", condition: "Core" },
	{ name: "Supabase", purpose: "Authentication and primary relational database", data: "Account, workspace, configuration, billing reference, request, usage, security, and support metadata", location: "AWS eu-west-2 (London), verified against the production project on 30 August 2026", condition: "Core" },
	{ name: "Upstash", purpose: "Redis-backed response caching and cache-related routing data", data: "Workspace-scoped cache keys, model outputs, response metadata, and short-lived routing/cache records", location: "Production database region requires factual confirmation", condition: "When the Redis binding is enabled" },
	{ name: "OpenAI", purpose: "Classify a configured sample of opted-in data contributions", data: "Best-effort-redacted prompt and response content and classifier instructions", location: "According to the Phaseo OpenAI API account and applicable transfer terms; factual confirmation required", condition: "Only when data contribution and upstream classification are enabled" },
] as const;

const operationalProviders = [
	{ name: "Stripe", role: "Billing and payment processing", data: "Billing identity, transaction, invoice, refund, and payment-method data" },
	{ name: "Resend", role: "Transactional and operational email", data: "Recipient contact details, email content, and delivery events" },
	{ name: "Statsig", role: "Feature flags and experiments", data: "Stable, user, workspace, environment, and feature-evaluation identifiers; authenticated email where configured" },
	{ name: "Google Analytics", role: "Consent-based website analytics", data: "Page, device, referrer, event, and coarse location data" },
	{ name: "Vercel Web Analytics", role: "Consent-based website analytics", data: "Page, device, referrer, and performance telemetry" },
	{ name: "PostHog", role: "Product analytics where the production key is enabled", data: "Product events, page, device, and usage telemetry; raw gateway content is excluded by design" },
	{ name: "Axiom", role: "Operational observability where the production key is enabled", data: "Workspace and request telemetry; sampled best-effort-redacted request details where configured" },
	{ name: "Mintlify", role: "Documentation hosting", data: "Documentation requests, network data, and documentation analytics" },
	{ name: "incident.io", role: "Public status page and incident communications", data: "Status-page traffic and incident-subscription contact details when supplied" },
	{ name: "Tawk.to", role: "Optional live support chat", data: "Contact details, chat content, device, and page context" },
	{ name: "Notion", role: "Support ticket and internal workflow management", data: "Contact details, ticket content, and related account context" },
	{ name: "Discord", role: "Internal operational notifications and customer-configured alert delivery", data: "Masked contact data, operational or billing summaries, and customer-selected alert content" },
] as const;

const managedProcessorTerms = ["Amazon Web Services (Bedrock)", "Anthropic", "Google Cloud (Vertex AI)", "Groq", "Mistral AI", "OpenAI"] as const;
const managedPendingContract = ["AionLabs", "AkashML", "Alibaba Cloud", "AtlasCloud", "Baseten", "BytePlus", "Cerebras", "DeepInfra", "GMICloud", "Meta Model API", "Morph", "Nebius Token Factory", "NovitaAI", "SiliconFlow", "Venice", "Wafer", "Xiaomi", "z.AI"] as const;
const managedRestricted = ["Arcee AI", "Cohere", "DeepSeek", "ElevenLabs", "Fireworks AI", "Google AI Studio", "MiniMax", "Moonshot AI", "Poolside", "Sakana AI", "Together AI", "Voyage AI", "Weights & Biases"] as const;

export default function SubprocessorsPage() {
	return (
		<TrustDocument
			title="Subprocessors and third-party processing"
			description="A dated schedule of the services Phaseo uses, the data they may receive, and the conditions that apply. The legal role of an AI provider can vary by route and contract."
			status="Public schedule · factual and legal review noted"
		>
			<TrustCallout title="How to read this schedule">
				The first table identifies services that can process Customer Data on Phaseo's behalf under a customer DPA. Later sections distinguish customer-selected AI providers and services Phaseo mainly uses for its own controller operations. Inclusion does not mean every service receives every customer's data.
			</TrustCallout>

			<TrustSection id="core" title="1. Core and conditional subprocessors">
				<TrustTable>
					<table className="w-full min-w-[960px] text-left">
						<thead><tr className="border-b border-border text-xs"><th className="py-3 pr-4 font-medium">Provider</th><th className="py-3 pr-4 font-medium">Purpose</th><th className="py-3 pr-4 font-medium">Data</th><th className="py-3 pr-4 font-medium">Processing location</th><th className="py-3 font-medium">When used</th></tr></thead>
						<tbody className="align-top">{coreProcessors.map((provider) => <tr key={provider.name} className="border-b border-border last:border-0"><th className="py-4 pr-4 font-medium text-foreground">{provider.name}</th><td className="py-4 pr-4">{provider.purpose}</td><td className="py-4 pr-4">{provider.data}</td><td className="py-4 pr-4">{provider.location}</td><td className="py-4">{provider.condition}</td></tr>)}</tbody>
					</table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="managed-ai" title="2. Phaseo-managed AI providers">
				<p>Phaseo compared the active production Gateway routes with the production Worker's managed credential bindings on 30 August 2026. Thirty-eight provider families met both conditions. The legal role is determined by the API recipient and its contract, not by the developer of a model available through that API.</p>
				<div className="grid gap-6 lg:grid-cols-3">
					<div><h3 className="font-medium text-foreground">Processor terms located</h3><p className="mt-2">Current processor terms or a DPA were located for the relevant business service. Account configuration, contracting entity, transfers, and feature-specific terms still require confirmation.</p><ul className="mt-3 list-disc space-y-1 pl-5">{managedProcessorTerms.map((name) => <li key={name}>{name}</li>)}</ul></div>
					<div><h3 className="font-medium text-foreground">Processor contract pending</h3><p className="mt-2">Phaseo intends these providers to act only as subprocessors, but has not yet recorded sufficient Article 28 contract evidence. They are provisional for personal-data processing.</p><ul className="mt-3 list-disc space-y-1 pl-5">{managedPendingContract.map((name) => <li key={name}>{name}</li>)}</ul></div>
					<div><h3 className="font-medium text-foreground">Restricted review</h3><p className="mt-2">Training, opt-out-dependent, or unclear own-purpose terms remain. These providers should not receive unrestricted Customer Personal Data through the managed pool until the issue is resolved.</p><ul className="mt-3 list-disc space-y-1 pl-5">{managedRestricted.map((name) => <li key={name}>{name}</li>)}</ul></div>
				</div>
				<p>This is a preliminary role register, not a representation that every listed managed route is approved for personal data. Phaseo must either complete the outstanding contract and configuration checks or remove the affected provider from the managed pool before executing the DPA.</p>
			</TrustSection>

			<TrustSection id="ai" title="3. Customer-selected AI providers">
				<p>Phaseo sends request content and necessary metadata to the provider selected by the customer, the requested model, or the customer's routing configuration. The available set changes as routes are added, disabled, or degraded. The live <Link href="/api-providers" className="text-foreground underline underline-offset-4">provider directory</Link> is the maintainable source for currently available providers.</p>
				<p>When Phaseo uses its own provider account, the provider is intended to be Phaseo's subprocessor for inference and must satisfy the managed-provider review above. When the customer supplies the credentials or holds the provider contract, the provider is normally a customer-directed recipient or the customer's own processor. A provider may separately act as a controller where it processes data for its own purposes, including training where permitted by its terms.</p>
			</TrustSection>

			<TrustSection id="operations" title="4. Other service providers">
				<p>These vendors support Phaseo's billing, communications, product operations, documentation, or support. They may be processors for Phaseo when Phaseo acts as a controller, but are not automatically subprocessors for all Customer Data under the DPA.</p>
				<TrustTable>
					<table className="w-full min-w-[720px] text-left">
						<thead><tr className="border-b border-border text-xs"><th className="py-3 pr-4 font-medium">Provider</th><th className="py-3 pr-4 font-medium">Role</th><th className="py-3 font-medium">Data</th></tr></thead>
						<tbody className="align-top">{operationalProviders.map((provider) => <tr key={provider.name} className="border-b border-border last:border-0"><th className="py-4 pr-4 font-medium text-foreground">{provider.name}</th><td className="py-4 pr-4">{provider.role}</td><td className="py-4">{provider.data}</td></tr>)}</tbody>
					</table>
				</TrustTable>
			</TrustSection>

			<TrustSection id="customer" title="5. Customer-directed destinations">
				<p>When a customer configures an observability endpoint, webhook, email recipient, Slack workspace, Microsoft Teams channel, Discord destination, OAuth application, or compatible AI assistant, Phaseo sends the selected data to that destination on the customer's instruction. Those recipients are not Phaseo-appointed subprocessors merely because Phaseo provides the connection.</p>
			</TrustSection>

			<TrustSection id="changes" title="6. Changes and objections">
				<p>Phaseo publishes material changes to this page with a new review date. Under the DPA review draft, Phaseo will notify the Customer's account email at least 30 days before a new Subprocessor begins processing Customer Personal Data and will accept written objections during that period.</p>
				<p>The public product does not yet offer a general subprocessor-change subscription. Customers reviewing an execution copy should confirm the notice contact with <a href="mailto:privacy@phaseo.app" className="text-foreground underline underline-offset-4">privacy@phaseo.app</a>.</p>
			</TrustSection>

			<TrustSection id="history" title="7. Change history">
				<dl className="grid gap-2 border-y border-border py-4 sm:grid-cols-[10rem_1fr]"><dt className="font-medium text-foreground">30 August 2026</dt><dd>Initial evidence-backed schedule. Added the short-lived Upstash response cache, optional OpenAI data-contribution classification, and separate customer-directed and controller-operation categories.</dd></dl>
			</TrustSection>
		</TrustDocument>
	);
}
