import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Layers3, Rocket } from "lucide-react";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
	title: "Experiments - Phaseo",
	description:
		"Experiments is where we test and iterate on early Phaseo product experiments.",
	keywords: ["Experiments", "Labs", "Phaseo"],
	alternates: {
		canonical: "/experiments",
	},
};

export default function ExperimentsPage() {
	return (
		<>
			<ShowFooterStyle />
			<main className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
				<div className="mb-8 space-y-2">
					<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
						<FlaskConical className="h-3.5 w-3.5" />
						Experiments
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">Experiments</h1>
					<p className="max-w-6xl text-sm text-zinc-600 dark:text-zinc-300 sm:text-base">
						Try early-stage features and workflows. Everything here is actively evolving and
						can be changed, replaced, or removed without notice.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Layers3 className="h-5 w-5" />
								Council
							</CardTitle>
							<CardDescription>
								Query several models in parallel, compare where they align or diverge, then
								generate one consolidated answer.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link href="/experiments/council">Open Council</Link>
							</Button>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Rocket className="h-5 w-5" />
								Spawn+ (BYOC)
							</CardTitle>
							<CardDescription>
								Generate BYOC spawn commands and bootstrap scripts. You provision and pay cloud
								infra in your own account; Phaseo only bills Gateway usage.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link href="/experiments/spawn">Open Spawn+</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</main>
		</>
	);
}
