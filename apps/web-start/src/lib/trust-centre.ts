export const trustStates = [
	{ id: "available", label: "Available", description: "In the product today." },
	{ id: "gated", label: "Gated", description: "Available only to eligible workspaces or configurations." },
	{ id: "self-attested", label: "Self-attested", description: "Described from Phaseo's own code, policy, and operations; not independently audited." },
	{ id: "planned", label: "Planned", description: "Intended work, with no delivery date promised." },
	{ id: "independently-certified", label: "Independently certified", description: "Verified by an external certification body. Phaseo has none today." },
] as const;

export type TrustState = (typeof trustStates)[number]["id"];

export const trustLastReviewed = {
	iso: "2026-08-30",
	display: "30 August 2026",
} as const;

export const trustDocuments = [
	{
		title: "Security whitepaper",
		description: "Architecture, data flows, current safeguards, limitations, and customer responsibilities.",
		href: "/trust/security",
		status: "Self-attested",
	},
	{
		title: "Subprocessors",
		description: "Core infrastructure, conditional processors, and customer-directed third parties.",
		href: "/trust/subprocessors",
		status: "Public schedule",
	},
	{
		title: "Data Processing Addendum",
		description: "A non-binding first draft for UK and EU controller-to-processor review.",
		href: "/trust/dpa",
		status: "Legal review required",
	},
] as const;

export const trustPractices: Array<{
	title: string;
	description: string;
	state: TrustState;
}> = [
	{
		title: "Encrypted transport",
		description: "Phaseo's public service is delivered over HTTPS. Requests are forwarded to model providers over encrypted HTTPS connections.",
		state: "self-attested",
	},
	{
		title: "Provider key protection",
		description: "Bring-your-own provider credentials are encrypted with AES-256-GCM before storage. API, management, and OAuth secrets use one-way HMAC or password-based derivation before storage.",
		state: "self-attested",
	},
	{
		title: "Scoped access and OAuth",
		description: "Workspace roles and scoped API or OAuth permissions limit access. OAuth connections expose their requested permissions through a consent flow and can be revoked.",
		state: "available",
	},
	{
		title: "Enterprise identity",
		description: "SAML single sign-on and SCIM user and group provisioning exist behind workspace entitlement and feature gates; they are not baseline features for every account.",
		state: "gated",
	},
	{
		title: "Private vulnerability reporting",
		description: "Reports can be submitted through GitHub Security Advisories or security@phaseo.app. Phaseo targets acknowledgement within three business days.",
		state: "available",
	},
];

export const dataPractices: Array<{
	title: string;
	description: string;
	state: TrustState;
}> = [
	{
		title: "Gateway content by default",
		description: "Raw prompts and full outputs are excluded from Phaseo's primary request database and analytics. Eligible non-streaming outputs may be cached in Upstash for five minutes by default, and up to 24 hours when a cache policy is configured.",
		state: "self-attested",
	},
	{
		title: "Private I/O logging",
		description: "A feature-gated workspace setting can store request, response, and optional provider payloads in private Cloudflare R2 for 90, 180, or 365 days. It is off by default.",
		state: "gated",
	},
	{
		title: "Optional data contribution",
		description: "This is opt-in. Eligible prompts and completions may be redacted and retained for no more than 30 days; revoking consent stops new capture and queues prior captures for deletion.",
		state: "available",
	},
	{
		title: "Provider retention and training",
		description: "Phaseo cannot promise zero data retention across every model provider. Downstream handling follows the provider and route you use; review that provider's policy before sending sensitive data.",
		state: "self-attested",
	},
	{
		title: "Regional routing",
		description: "Provider and geography controls can constrain eligible routes, but Phaseo does not currently promise end-to-end data residency for every request.",
		state: "gated",
	},
];

export const disclosedServiceProviders = [
	{ name: "Cloudflare and Vercel", purpose: "Host, secure, and deliver the service", data: "Service traffic, request content in transit, and operational metadata needed to run Phaseo" },
	{ name: "Supabase", purpose: "Database and account infrastructure", data: "Account, workspace, configuration, and request metadata" },
	{ name: "Upstash", purpose: "Short-lived response caching", data: "Cached model outputs, workspace-scoped cache keys, and response metadata" },
	{ name: "Stripe", purpose: "Payments and billing", data: "Billing identity and transaction records; Phaseo does not store full card details" },
	{ name: "Analytics and feature providers", purpose: "Product analytics, feature delivery, and error diagnosis", data: "Page, device, identity, and usage telemetry; raw gateway prompts and outputs are excluded" },
	{ name: "Email and support providers", purpose: "Service communications and customer support", data: "Contact details, message or ticket contents, and related account context" },
	{ name: "Model providers", purpose: "Process the inference request you route", data: "Inputs, outputs, and necessary request metadata; provider terms and retention apply" },
	{ name: "Connected assistant providers", purpose: "Return authorised OAuth tool results", data: "Only the read-only result and scopes approved through the consent flow" },
] as const;

export const deliberatelyUnclaimed = [
	"SOC 2, ISO 27001, PCI DSS, HIPAA, or another independent Phaseo certification",
	"A completed independent penetration test or published audit report",
	"A contractual uptime SLA for the public service",
	"Universal zero data retention or a guarantee that providers do not train on request data",
	"Guaranteed regional data residency for every provider and route",
	"A legal opinion or automatically executed DPA from the public first draft",
] as const;
