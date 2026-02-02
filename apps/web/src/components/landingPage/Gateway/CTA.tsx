import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

export function CTA() {
	return (
		<section className="py-8 mb-8">
			<div className="mx-auto max-w-6xl px-6 text-center lg:px-8">
				{/* Headline */}
				<h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
					Launch with an enterprise-grade gateway
				</h2>

				{/* Description */}
				<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
					Unify provider access, enforce intelligent routing policies,
					and keep SLAs stable as the model landscape shifts. Start
					with our free models — scale when you're ready.
				</p>

				{/* Quickstart note */}
				<p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
					Make your first API call in less than 5 minutes with our
					quickstart.
				</p>

				{/* CTA buttons */}
				<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
					<Button
						asChild
						size="default"
						className="h-12 gap-3 px-6 text-sm font-semibold text-white bg-slate-900 shadow-lg shadow-black/20 hover:scale-105 transition-transform"
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
						className="h-12 gap-3 border-slate-600 bg-transparent px-6 text-sm font-semibold hover:scale-105 transition-transform"
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
