import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	GitBranch,
	Handshake,
	Heart,
	Route,
	Scale,
	ShieldCheck,
	Users,
	Wallet,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = buildMetadata({
	title: "About",
	description:
		"Learn who Phaseo is, what it stands for, and why it is building an open-source, provider-neutral gateway for accessible AI inference.",
	path: "/about",
	keywords: ["Phaseo", "about", "AI gateway", "open-source AI", "AI inference", "AI access"],
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
			<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
			{description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
		</div>
	);
}

function TextLink({
	href,
	label,
	external = false,
}: {
	href: string;
	label: string;
	external?: boolean;
}) {
	return (
		<Link
			href={href}
			{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
			className="inline-flex items-center text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground"
		>
			{label}
			<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
		</Link>
	);
}

const beliefs = [
	{
		title: "Open Source Builds Trust",
		description: "The gateway, its behavior, and its standards should be inspectable and improvable by the people who depend on them.",
		icon: GitBranch,
	},
	{
		title: "No Surplus Fee Is the Goal",
		description: "The long-term goal is to remove avoidable platform cost so people pay for inference, not a permanent gateway surcharge. Any promise about that must follow sustainable economics.",
		icon: Wallet,
	},
	{
		title: "Access Should Be Broad",
		description: "People should be able to discover and use the best available models, regardless of which provider operates them.",
		icon: Users,
	},
	{
		title: "Choice Should Be Real",
		description: "A stable, open interface should make it possible to change models or providers without rebuilding everything.",
		icon: Route,
	},
	{
		title: "Transparency Beats Lock-In",
		description: "Public model data, clear pricing, lifecycle signals, and observable requests are better than opaque convenience.",
		icon: ShieldCheck,
	},
	{
		title: "Revenue Should Serve Access",
		description: "Reliable infrastructure needs sustainable revenue, but revenue is the means to keep the service useful, not the reason the service exists.",
		icon: Scale,
	},
] as const;

const forYou = {
	title: "For You.",
	description: "Phaseo is built for you: the person who wants the freedom to choose the right model, the clarity to understand the trade-offs, and the confidence that the gateway is acting in your best interests. We want this to be the most honest and transparent AI gateway you use, shaped by the community it serves and accountable to the people who rely on it.",
	icon: Heart,
} as const;
const ForYouIcon = forYou.icon;

const builtFor = [
	{
		title: "For People",
		description: "More ways to find useful models, understand the trade-offs, and use AI without a permanent commitment to one gatekeeper.",
		icon: Users,
	},
	{
		title: "For Developers",
		description: "A portable integration surface, reliable routing, and enough visibility to understand what happened when a request was served.",
		icon: Route,
	},
	{
		title: "For Providers",
		description: "An open distribution layer that can bring qualified demand, useful feedback, and a direct voice in how models are represented and used.",
		icon: Handshake,
	},
] as const;

export default function AboutPage() {
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						AI Should Benefit Everyone.
					</h1>
					<p className="max-w-none text-base leading-7 text-muted-foreground">
						I started Phaseo to make that principle practical: an open-source, provider-neutral gateway that lets people discover and use as many models as possible without locking themselves to one provider.
					</p>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
						<TextLink href="/mission" label="Read Our Mission" />
						<TextLink href="/models" label="Browse the Model Catalog" />
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title="Who Phaseo Is."
						description="An independent project built around a simple idea: access to intelligence should expand people&apos;s choices, not narrow them."
					/>
					<div className="space-y-4 border-l border-zinc-200/80 pl-6 text-sm leading-7 text-muted-foreground dark:border-zinc-800/80">
						<p>
							Phaseo is the company and the open-source project I am building to connect model discovery, inference, and honest operational information in one place.
						</p>
						<p>
							The aim is not to become another permanent gatekeeper. It is to make the layer between people and model providers more useful, more portable, and easier to question.
						</p>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title="What We Stand For."
						description="These are the choices behind the product, the business, and the relationships we want to build."
					/>
					<div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
						{beliefs.map((belief) => {
							const Icon = belief.icon;
							return (
								<div
									key={belief.title}
									className="flex gap-4"
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
										<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
									</div>
									<div className="space-y-1">
										<h3 className="text-base font-semibold text-foreground">{belief.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{belief.description}</p>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[1fr_0.86fr] lg:items-start">
					<div className="space-y-6">
						<SectionTitle
							title="Why an Open Gateway."
							description="The AI ecosystem is becoming more capable and more fragmented at the same time."
						/>
						<div className="space-y-4 text-sm leading-7 text-muted-foreground">
							<p>
								Every provider has different models, APIs, pricing, limits, and policies. That fragmentation creates unnecessary work and makes it hard for people to know what they are paying for or where a request went.
							</p>
							<p>
								An open gateway can make that complexity navigable without hiding it. Phaseo is meant to keep integrations portable, show the trade-offs, and help providers compete on quality, reliability, and value rather than on lock-in.
							</p>
						</div>
					</div>
					<blockquote className="border-l border-emerald-500/50 pl-6 dark:border-emerald-400/50">
						<p className="text-xl font-medium leading-8 tracking-tight text-foreground sm:text-2xl">
							“The best gateway gives users more choice over time, stays transparent and accountable to them, and is built with the community it serves.”
						</p>
						<footer className="mt-4 text-sm leading-6 text-muted-foreground">
							It should be shaped by the people who use it, not only by the company that runs it.
						</footer>
					</blockquote>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title="Inspired by Missions That Put People First."
						description="We are inspired by the idea that advanced AI should improve life for everyone, not only the companies that control the infrastructure."
					/>
					<div className="space-y-4 text-sm leading-7 text-muted-foreground">
						<p>
							OpenAI&apos;s public mission that AGI should benefit all of humanity puts the right question at the center: who ultimately benefits from more capable AI?
						</p>
						<p>
							Phaseo is taking a narrower, practical route toward the same kind of human benefit. If people can reach more models through an open-source gateway, compare them honestly, and move between providers freely, more of the value stays with the people building and using the technology.
						</p>
						<p>
							That is an inspiration, not an affiliation. Phaseo is its own project, with its own responsibility to prove that openness, portability, and fair access can work in practice.
						</p>
						<p>
							There is also a business-model difference. A conventional for-profit platform has to balance user value with the financial return expected by its owners. Phaseo is being built around a different priority: sustainable operations, usefulness first, and no surplus fee as the destination. The point is not to take a bigger toll; it is to make the toll unnecessary.
						</p>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title="Built for You, With the Community."
						description="Phaseo exists to give you a more honest, transparent, and portable way to use AI, shaped by the people who rely on it."
					/>
					<div className="space-y-8">
						<div className="w-full">
							<div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-12">
								<div className="space-y-3">
									<ForYouIcon className="h-7 w-7 text-primary" aria-hidden="true" />
									<h3 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{forYou.title}</h3>
								</div>
								<p className="max-w-none text-base leading-8 text-muted-foreground">{forYou.description}</p>
							</div>
						</div>
						<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="grid gap-8 lg:grid-cols-3">
							{builtFor.map((item) => {
								const Icon = item.icon;
								return (
									<div key={item.title} className="space-y-3">
										<Icon className="h-5 w-5 text-primary" aria-hidden="true" />
										<h3 className="text-base font-semibold text-foreground">{item.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
									</div>
								);
							})}
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="py-8">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">More Access. Less Lock-In.</h2>
							<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
								That is the future Phaseo is working toward: infrastructure that serves people, gives providers a fair path to be discovered, and keeps the ecosystem open enough to improve.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-3 lg:justify-end">
							<Button asChild size="lg">
								<Link href="/sign-up">
									Get Started
									<ArrowRight className="size-4" aria-hidden="true" />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/mission">Read Our Mission</Link>
							</Button>
							<Button asChild className="px-1 text-foreground hover:text-foreground/70 dark:text-white dark:hover:text-white/70" size="lg" variant="link">
								<Link href="/contact">
									Get in Touch
									<ArrowRight className="size-4" aria-hidden="true" />
								</Link>
							</Button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
