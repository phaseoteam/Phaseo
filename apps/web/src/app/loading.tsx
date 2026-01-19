import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, BookOpen, Layers, Network, Loader2 } from "lucide-react";
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
		href: "/conduit",
		label: "Explore the Conduit",
		description:
			"Use the AI Stats Conduit to reach every model with one API.",
		icon: Network,
	},
];

export default function Loading() {
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
						Loading
					</p>

					<h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
						Preparing your page
					</h1>

					<p className="mt-4 text-sm text-muted-foreground sm:text-base">
						AI Stats is fetching the latest data for this page. This
						usually only takes a moment.
					</p>

					<div className="mt-6 flex justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-primary" />
					</div>

					<div className="mt-8 flex justify-center">
						<Button asChild variant="outline" size="sm">
							<Link href="/">Back to home</Link>
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

					<p className="mt-3 text-xs text-muted-foreground sm:text-sm">
						If this screen doesn&apos;t disappear after a short
						while, you can refresh the page or use one of the links
						above to continue.
					</p>
				</div>
			</div>
		</div>
	);
}
