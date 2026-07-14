import Link from "next/link";
import { Button } from "@/components/ui/button";

export function GetStartedSection() {
	return (
		<section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="mx-auto max-w-2xl space-y-4 text-center">
				<p className="text-sm uppercase tracking-[0.4em] text-slate-500 dark:text-slate-300">
					Ready for the gateway
				</p>
				<h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
					Get started in minutes or help shape the code.
				</h2>
				<p className="text-sm text-slate-600 dark:text-slate-400">
					Spin up routing, reuse providers, and see the code that
					keeps everything observable and open.
				</p>
				<div className="flex flex-wrap justify-center gap-3">
					<Button asChild size="lg">
						<Link href="/sign-up">Get started</Link>
					</Button>
					<Button asChild variant="outline" size="lg">
						<Link
							href="https://github.com/phaseoteam/Phaseo"
							target="_blank"
							rel="noreferrer"
						>
							View the code
						</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
