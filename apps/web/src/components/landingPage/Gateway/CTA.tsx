import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

export function CTA() {
	return (
		<section className="mb-8 py-8">
			<div className="mx-auto max-w-6xl px-6 text-center lg:px-8">
				<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl lg:text-5xl">
					Launch with an enterprise-grade gateway
				</h2>

				<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
					Unify provider access, enforce intelligent routing policies,
					and keep SLAs stable as the model landscape shifts. Start
					with our free models - scale when you are ready.
				</p>

				<p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
					Make your first API call in less than 5 minutes with our
					quickstart.
				</p>

				<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
					<Button
						asChild
						size="default"
						className="h-12 gap-3 bg-zinc-900 px-6 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 hover:bg-zinc-800"
					>
						<Link href={SALES_HREF}>
							Create free account
							<ArrowRight className="h-5 w-5" />
						</Link>
					</Button>
					<Button
						asChild
						size="default"
						variant="outline"
						className="h-12 gap-3 border-zinc-300 bg-transparent px-6 text-sm font-semibold text-zinc-800 transition-transform hover:scale-105 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
					>
						<Link href={DOCS_HREF}>
							<BookOpen className="h-5 w-5" />
							Quickstart
						</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}

