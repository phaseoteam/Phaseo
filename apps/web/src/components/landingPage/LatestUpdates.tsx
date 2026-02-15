import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import LatestUpdatesCards, {
	LatestUpdatesCardsFallback,
} from "@/components/landingPage/LatestUpdatesCards";

export default function LatestUpdates() {
	return (
		<section className="space-y-4">
			<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
				<div className="space-y-2">
					<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
						The Latest Updates{" "}
						<span className="text-zinc-500 font-normal">
							from AI Stats
						</span>
					</h2>
				</div>
				<Link
					href="/updates"
					className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
				>
					View all updates
					<ArrowUpRight className="h-4 w-4" />
				</Link>
			</div>

			<Suspense fallback={<LatestUpdatesCardsFallback />}>
				<LatestUpdatesCards />
			</Suspense>
		</section>
	);
}
