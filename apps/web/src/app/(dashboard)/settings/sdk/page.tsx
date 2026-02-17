import type { Metadata } from "next";
import { Boxes, CheckCircle2, CircleAlert, Clock3, FlaskConical } from "lucide-react";
import { SdkCard } from "@/components/(gateway)/settings/sdk/SdkCard";

type Sdk = {
	name: string;
	packageName: string;
	installCommand: string;
	logoId: string;
	docsLink: string;
	managerLink: string;
	supported: boolean;
	stage?: "alpha";
};

const DOCS_BASE = "https://docs.ai-stats.phaseo.app/v1";

const SDKS: Sdk[] = [
	{
		name: "Vercel AI SDK",
		packageName: "@ai-stats/ai-sdk-provider",
		installCommand: "npm install @ai-stats/ai-sdk-provider ai@^6",
		logoId: "vercel",
		docsLink: `${DOCS_BASE}/sdk-reference/sdk/ai-sdk`,
		managerLink: "https://www.npmjs.com/package/@ai-stats/ai-sdk-provider",
		supported: true,
	},
	{
		name: "C# SDK",
		packageName: "@ai-stats/csharp-sdk",
		installCommand: "Coming soon",
		logoId: "csharp",
		docsLink: `${DOCS_BASE}/sdk-reference/csharp/overview`,
		managerLink: "https://www.nuget.org/",
		supported: false,
		stage: "alpha",
	},
	{
		name: "C++ SDK",
		packageName: "@ai-stats/cpp-sdk",
		installCommand: "Coming soon",
		logoId: "cpp",
		docsLink: `${DOCS_BASE}/sdk-reference/cpp/overview`,
		managerLink: "https://conan.io/",
		supported: false,
	},
	{
		name: "Go SDK",
		packageName: "@ai-stats/go-sdk",
		installCommand: "Coming soon",
		logoId: "go",
		docsLink: `${DOCS_BASE}/sdk-reference/go/overview`,
		managerLink: "https://pkg.go.dev/",
		supported: false,
		stage: "alpha",
	},
	{
		name: "Java SDK",
		packageName: "@ai-stats/java-sdk",
		installCommand: "Coming soon",
		logoId: "java",
		docsLink: `${DOCS_BASE}/sdk-reference/java/overview`,
		managerLink: "https://search.maven.org/",
		supported: false,
		stage: "alpha",
	},
	{
		name: "PHP SDK",
		packageName: "@ai-stats/php-sdk",
		installCommand: "Coming soon",
		logoId: "php",
		docsLink: `${DOCS_BASE}/sdk-reference/php/overview`,
		managerLink: "https://packagist.org/",
		supported: false,
		stage: "alpha",
	},
	{
		name: "Python SDK",
		packageName: "ai-stats-py-sdk",
		installCommand: "pip install ai-stats-py-sdk",
		logoId: "python",
		docsLink: `${DOCS_BASE}/sdk-reference/python/overview`,
		managerLink: "https://pypi.org/project/ai-stats-py-sdk/",
		supported: true,
	},
	{
		name: "Ruby SDK",
		packageName: "@ai-stats/ruby-sdk",
		installCommand: "Coming soon",
		logoId: "ruby",
		docsLink: `${DOCS_BASE}/sdk-reference/ruby/overview`,
		managerLink: "https://rubygems.org/",
		supported: false,
		stage: "alpha",
	},
	{
		name: "Rust SDK",
		packageName: "@ai-stats/rust-sdk",
		installCommand: "Coming soon",
		logoId: "rust",
		docsLink: `${DOCS_BASE}/sdk-reference/rust/overview`,
		managerLink: "https://crates.io/",
		supported: false,
	},
	{
		name: "TypeScript SDK",
		packageName: "@ai-stats/sdk",
		installCommand: "npm install @ai-stats/sdk",
		logoId: "typescript",
		docsLink: `${DOCS_BASE}/sdk-reference/typescript/overview`,
		managerLink: "https://www.npmjs.com/package/@ai-stats/sdk",
		supported: true,
	},
];

export const metadata: Metadata = {
	title: "SDKs - Settings",
	description:
		"SDKs and integrations for the AI Stats gateway, including TypeScript, Python, and the Vercel AI SDK provider.",
};

export default function SettingsSdkPage() {
	const stableSdks = SDKS.filter((sdk) => sdk.supported);
	const alphaSdks = SDKS.filter((sdk) => !sdk.supported && sdk.stage === "alpha");
	const comingSoonSdks = SDKS.filter((sdk) => !sdk.supported && sdk.stage !== "alpha");

	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Boxes className="h-5 w-5 text-muted-foreground" />
						<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
							SDKs for the AI Stats gateway
						</h1>
					</div>
					<p className="text-sm text-zinc-600 dark:text-zinc-300">
						Use the official SDKs and integration providers with direct
						links to docs and package registries.
					</p>
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
					<CheckCircle2 className="h-4 w-4 text-emerald-500" />
					Stable
				</h2>
				<div className="space-y-2">
					{stableSdks.map((sdk) => (
						<SdkCard key={sdk.packageName} sdk={sdk} />
					))}
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
					<FlaskConical className="h-4 w-4 text-amber-500" />
					Alpha
				</h2>
				<p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
					<CircleAlert className="ml-2 h-3.5 w-3.5" />
					Alpha SDKs are source-ready but not fully published to registries yet.
				</p>
				<div className="space-y-2">
					{alphaSdks.map((sdk) => (
						<SdkCard key={sdk.packageName} sdk={sdk} />
					))}
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
					<Clock3 className="h-4 w-4 text-muted-foreground" />
					Coming Soon
				</h2>
				<div className="space-y-2">
					{comingSoonSdks.map((sdk) => (
						<div key={sdk.packageName} className="opacity-60">
							<SdkCard sdk={sdk} />
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
