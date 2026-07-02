import type { ExtendedModel } from "@/data/types";
import Link from "next/link";

function joinWithVs(values: string[]): string {
	return values.join(" vs ");
}

function joinModelDescriptions(selectedModels: ExtendedModel[]): string {
	return selectedModels
		.map((model) => `${model.name} from ${model.provider.name}`)
		.join(", ");
}

export default function ComparisonHeader({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const title = joinWithVs(selectedModels.map((model) => model.name));
	const description = joinModelDescriptions(selectedModels);

	return (
		<section className="space-y-5">
			<nav className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
				<Link
					href="/"
					className="shrink-0 text-primary underline decoration-transparent underline-offset-2 hover:decoration-current"
				>
					Home
				</Link>
				<span>/</span>
				<Link
					href="/compare"
					className="shrink-0 text-primary underline decoration-transparent underline-offset-2 hover:decoration-current"
				>
					Compare
				</Link>
				<span>/</span>
				<span className="truncate text-foreground">{title}</span>
			</nav>

			<div className="max-w-4xl space-y-3">
				<h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
					{title}
				</h1>
				<p className="text-pretty text-base leading-7 text-muted-foreground">
					Compare {description} on key metrics including benchmarks, price,
					context length, providers, gateway usage, and other model features.
				</p>
			</div>
		</section>
	);
}

