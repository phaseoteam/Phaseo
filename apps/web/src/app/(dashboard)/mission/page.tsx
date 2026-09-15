import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	Database,
	GitBranch,
	Handshake,
	LineChart,
	Route,
	ShieldCheck,
	Sparkles,
	Users,
	Wallet,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = buildMetadata({
	title: "Our Mission",
	description:
		"Phaseo is building open, affordable, provider-neutral AI infrastructure that keeps model access transparent and portable.",
	path: "/mission",
	keywords: [
		"Phaseo mission",
		"open source AI gateway",
		"affordable AI",
		"AI model access",
		"AI gateway principles",
	],
});

function SectionTitle({
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			<h2 className="max-w-4xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{title}
			</h2>
			{description ? (
				<p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
			) : null}
		</div>
	);
}

const principles = [
	{
		title: "Broad access",
		description:
			"Support as many useful models, providers, modalities, and capabilities as we responsibly can through one consistent interface.",
		icon: Database,
	},
	{
		title: "The lowest sustainable price",
		description:
			"Use provider partnerships and operating efficiency to reduce avoidable cost, return those gains to users, and keep enough margin to run reliable infrastructure.",
		icon: Wallet,
	},
	{
		title: "Open by default",
		description:
			"Keep Phaseo open source so the gateway can be inspected, extended, challenged, and improved by the people who depend on it.",
		icon: GitBranch,
	},
	{
		title: "Users before investors",
		description:
			"Make decisions around long-term user benefit, product quality, and fair access rather than pressure to maximise short-term financial returns.",
		icon: Users,
	},
	{
		title: "Transparency without lock-in",
		description:
			"Make pricing, routing, availability, lifecycle changes, and operational behaviour understandable while keeping data and integrations portable.",
		icon: ShieldCheck,
	},
	{
		title: "Technical excellence",
		description:
			"Compete through accurate data, reliable routing, strong compatibility, useful observability, and a developer experience that feels simple.",
		icon: Sparkles,
	},
	{
		title: "Built with everyone",
		description:
			"Give users, contributors, model creators, and providers meaningful ways to shape the platform and the standards around it.",
		icon: Handshake,
	},
] as const;

const measures = [
	"Models, providers, modalities, and regions covered",
	"Routes available through more than one provider",
	"Price reductions and efficiency gains returned to users",
	"Provider demand and volume generated through Phaseo",
	"Gateway reliability, latency, and platform overhead",
	"Payment and operating costs that can be removed over time",
	"Open-source contributors and community-led improvements",
	"Time taken to publish releases, corrections, and lifecycle changes",
] as const;

export default function MissionPage() {
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7">
					<h1 className="max-w-5xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						Make AI Inference Open, Affordable, and Available to Everyone.
					</h1>

					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						Phaseo is building an open-source, verifiable gateway that lets people discover and use models across providers without lock-in. We work with providers to lower the cost of serving inference, then use those gains to reduce avoidable platform overhead and improve access.
					</p>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/models">
								Explore models
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="https://github.com/phaseoteam/Phaseo" target="_blank" rel="noopener noreferrer">
								View the source
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10 sm:px-3">
							<Link href="/updates">Read the latest updates</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="max-w-3xl space-y-3">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
								People Should Pay for Inference, Not an Avoidable Gateway Surcharge.
							</h2>
							<p className="text-sm leading-6 text-muted-foreground">
								Phaseo is transparent about today&apos;s fees. The long-term goal is to remove avoidable
								platform overhead as provider relationships, routing efficiency, and sustainable
								operations make that possible.
							</p>
						</div>
						<div className="flex items-center gap-3 text-sm text-muted-foreground lg:justify-self-end">
							<Wallet aria-hidden="true" className="size-5 shrink-0 text-primary" />
							<span>Open economics. Measurable progress.</span>
						</div>
					</section>
				</div>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title="AI infrastructure should serve the people who use it."
						description="The model ecosystem is fragmented across laboratories, inference providers, clouds, prices, interfaces, and policies. Phaseo exists to make that complexity understandable and usable through an open layer that keeps people free to choose."
					/>

					<div className="border-l border-zinc-200/80 pl-6 dark:border-zinc-800/80">
						<h3 className="text-lg font-semibold tracking-tight text-foreground">What success means</h3>
						<div className="mt-3 space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								We want to build the best possible gateway with the people who use it. Success means people can reach the right model, through the right provider, at a fair price, with a clear understanding of what happened and where the money went.
							</p>
							<p>
								We will also consider the mission successful when Phaseo&apos;s open-source work, public data, or standards help other products make AI more accessible, even when a request never passes through Phaseo. The goal is a healthier ecosystem, not permanent dependence on one gateway.
							</p>
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title="The commitments that guide how we build."
						description="These principles are intended to guide product, pricing, partnership, and business decisions as Phaseo grows."
					/>

					<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 md:grid-cols-2 md:gap-x-8">
						{principles.map((principle, index) => {
							const Icon = principle.icon;
							return (
								<div
									key={principle.title}
									className={`flex gap-4 py-5 ${
										index < principles.length - 1 ? "border-b border-zinc-200/80 dark:border-zinc-800/80" : ""
									} ${index === principles.length - 1 ? "md:col-span-2" : ""}`}
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
										<Icon className="h-4 w-4 text-foreground" />
									</div>
									<div className="space-y-1">
										<h3 className="text-base font-semibold text-foreground">{principle.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{principle.description}</p>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title="Sustainability is how the mission lasts."
						description="Phaseo is being built to stay accountable to users, providers, and the open-source community rather than pressure to maximise investor returns."
					/>

					<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 lg:grid-cols-3 lg:divide-x lg:divide-zinc-200/80 lg:dark:divide-zinc-800/80">
						<div className="space-y-2 border-b border-zinc-200/80 py-5 dark:border-zinc-800/80 lg:border-b-0 lg:px-6 lg:first:pl-0">
							<h3 className="text-base font-semibold text-foreground">Minimal sustainable margin</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								We want to retain only enough margin to operate reliable infrastructure, support the team, and keep improving the product. More efficiency should make access better, not simply make the platform extract more.
							</p>
						</div>

						<div className="space-y-2 border-b border-zinc-200/80 py-5 dark:border-zinc-800/80 lg:border-b-0 lg:px-6">
							<h3 className="text-base font-semibold text-foreground">Revenue serves access</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								Revenue matters because Phaseo must remain reliable and keep improving. It is a way to sustain the mission, not a reason to compromise fair pricing, openness, or the user experience.
							</p>
						</div>

						<div className="space-y-2 py-5 lg:px-6 lg:last:pr-0">
							<h3 className="text-base font-semibold text-foreground">Independence by design</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								If financing is ever considered, it must preserve Phaseo&apos;s independence, open-source commitment, fair treatment of users, and freedom to make long-term product decisions. Conventional venture capital is not the default path.
							</p>
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start">
					<div className="space-y-6">
						<SectionTitle
							title="Providers grow when developers can reach them."
							description="Phaseo gives model creators and inference providers an open distribution layer: easier discovery, a consistent integration surface, useful demand signals, and a direct way to help shape how their models are used."
						/>

						<div className="space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								We want to work directly with providers and the wider infrastructure ecosystem to reduce the cost of inference, compute, delivery, storage, observability, and payments while improving reliability.
							</p>
							<p>
								Better commercial terms, shared technical work, credits, more efficient software, and smarter routing can all lower the cost of serving a request. The loop is simple: better provider access leads to lower cost and stronger reliability, which brings more developers and more routed demand.
							</p>
							<p>
								We are looking for partners who want to grow with an open gateway, not just place a logo on another marketplace. Providers can help validate adapters, improve model metadata, shape routing and observability, and coordinate launches that send qualified users their way.
							</p>
						</div>
					</div>

					<div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80 lg:mt-1">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<Route className="h-4 w-4" />
							The partnership test
						</div>
						<p className="mt-3 text-sm leading-6 text-muted-foreground">
							A partnership should improve provider distribution and at least one of price, access, reliability, privacy, portability, or developer experience without undermining the others.
						</p>
						<Button asChild variant="outline" className="mt-5 w-full justify-between">
							<Link href="/contact">
								Work with Phaseo
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title="A mission should be visible in the product."
						description="We intend to judge progress using evidence that users can see, question, and help improve."
					/>

					<div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
						{measures.map((measure) => (
							<div
								key={measure}
								className="flex items-start gap-3"
							>
								<LineChart className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
								<span className="text-sm leading-6 text-muted-foreground">{measure}</span>
							</div>
						))}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="py-8">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground">Built in public, improved together.</h2>
							<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
								This mission is a living commitment. If Phaseo falls short, open an issue, propose a change, or help us build the better version.
							</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row">
							<Button asChild>
								<Link href="https://github.com/phaseoteam/Phaseo/issues" target="_blank" rel="noopener noreferrer">
									Open an issue
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link href="/about">About Phaseo</Link>
							</Button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
