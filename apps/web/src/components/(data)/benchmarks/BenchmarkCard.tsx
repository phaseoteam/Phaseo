import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BenchmarkCard as BenchmarkCardType } from "@/lib/fetchers/benchmarks/getAllBenchmarks";

export default function BenchmarkCard({
	benchmark_id,
	benchmark_name,
	total_models,
}: BenchmarkCardType) {
	return (
		<Card className="h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out border">
			<CardContent className="flex flex-row items-center gap-3 pt-6">
				<div className="flex flex-col min-w-0 flex-1">
					<Link
						href={`benchmarks/${benchmark_id}`}
						className="font-semibold truncate leading-tight text-left underline decoration-2 underline-offset-2 decoration-transparent hover:decoration-current transition-colors duration-200"
					>
						{benchmark_name}
					</Link>

					<div className="mt-2">
						<Badge variant="secondary" className="text-xs">
							{total_models} model{total_models !== 1 ? "s" : ""}
						</Badge>
					</div>
				</div>

				<div className="ml-auto flex items-center gap-1">
					<Button
						asChild
						size="icon"
						variant="ghost"
						tabIndex={-1}
						className="group"
					>
						<Link
							href={`benchmarks/${benchmark_id}`}
							aria-label={`Go to ${benchmark_name} details`}
							tabIndex={-1}
						>
							<ArrowRight className="w-5 h-5 transition-colors group-hover:text-primary" />
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
