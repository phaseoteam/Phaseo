import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Home, BookOpen, Layers, Network } from "lucide-react";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const suggestions = [
	{
		href: "/",
		label: "Go back home",
		description: "Return to the main page and start from a clean slate.",
		icon: Home,
	},
	{
		href: "/models",
		label: "Browse models",
		description: "Explore the catalogue of AI models and their details.",
		icon: Layers,
	},
	{
		href: "https://docs.ai-stats.phaseo.app",
		label: "Read the docs",
		description:
			"Check the documentation for guides, references, and examples.",
		icon: BookOpen,
	},
	{
		href: "/gateway",
		label: "Explore the Gateway",
		description:
			"Use the AI Stats Gateway to reach every model with one API.",
		icon: Network,
	},
];

export default function NotFound() {
	return (
		<div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-10">
			<div className="w-full max-w-3xl">
				{/* Top-left branding */}
				<div className="mb-8 flex items-center justify-start">
					<Link
						href="/"
						className="text-sm font-semibold tracking-tight text-muted-foreground hover:text-foreground"
					>
						AI Stats
					</Link>
				</div>

				<div className="text-center">
					<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
						404
					</p>

					<h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
						This page doesn&apos;t exist
					</h1>

					<p className="mt-4 text-sm text-muted-foreground sm:text-base">
						The URL may be out of date, the page might have been
						moved, or it never existed in the first place.
						Don&apos;t worry - you can jump back into the important
						parts of the site from here.
					</p>

					<div className="mt-8 flex justify-center">
						<Button asChild>
							<Link href="/">Return home</Link>
						</Button>
					</div>

					<div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
						{suggestions.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.href}
									href={item.href}
									className="group"
								>
									<Card className="h-full cursor-pointer border-border bg-card/70 transition hover:border-primary/60 hover:bg-accent/40">
										<CardHeader className="flex flex-row items-start gap-3">
											<div className="mt-1 rounded-full border bg-background p-2 transition group-hover:border-primary/70">
												<Icon className="h-4 w-4" />
											</div>
											<div>
												<CardTitle className="text-base">
													{item.label}
												</CardTitle>
												<CardDescription className="mt-1 text-xs sm:text-sm">
													{item.description}
												</CardDescription>
											</div>
										</CardHeader>
									</Card>
								</Link>
							);
						})}
					</div>

					<Separator className="my-6" />

					<div className="mt-3 text-sm">
						<p className="text-center text-muted-foreground">
							If you believe this is an error, please let us know:
						</p>
						<div className="mt-2 flex flex-wrap justify-center gap-2">
							<Button variant="ghost" size="sm" asChild>
								<Link
									href="https://github.com/YOUR_ORG/YOUR_REPO/issues"
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center"
								>
									<span className="mr-1 inline-flex h-4 w-4 items-center justify-center">
										{/* Light / dark GitHub icons */}
										<Image
											src="/social/github_light.svg"
											alt="GitHub"
											width={16}
											height={16}
											className="block dark:hidden"
										/>
										<Image
											src="/social/github_dark.svg"
											alt="GitHub"
											width={16}
											height={16}
											className="hidden dark:block"
										/>
									</span>
									GitHub
								</Link>
							</Button>
							<Button variant="ghost" size="sm" asChild>
								<Link
									href="https://discord.gg/YOUR_INVITE"
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center"
								>
									<span className="mr-1 inline-flex h-4 w-4 items-center justify-center">
										<Image
											src="/social/discord.svg"
											alt="Discord"
											width={16}
											height={16}
										/>
									</span>
									Discord
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
