import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";

export default function ComparisonHeader({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	return (
		<section className="space-y-2 text-center">
			<div className="sm:hidden space-y-1">
				{selectedModels.map((model, index) => (
					<div key={model.id} className="space-y-1">
						{index > 0 ? (
							<div className="text-xs font-medium text-muted-foreground">vs</div>
						) : null}
						<Link
							href={`/models/${model.id}`}
							className="inline-flex max-w-full items-center justify-center gap-2 text-2xl font-semibold tracking-tight underline decoration-transparent transition-colors hover:text-primary hover:decoration-current"
						>
							<ProviderLogo
								id={model.provider.provider_id}
								alt={model.provider.name}
								size="md"
								className="shrink-0"
							/>
							<span className="truncate">{model.name}</span>
						</Link>
					</div>
				))}
			</div>

			<h1 className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-3 sm:gap-y-2 sm:text-3xl sm:font-semibold sm:tracking-tight md:text-4xl">
				{selectedModels.map((model, index) => (
					<span key={model.id} className="inline-flex items-center gap-2 min-w-0">
						{index > 0 ? (
							<span className="text-base font-medium text-muted-foreground md:text-lg">
								vs
							</span>
						) : null}
						<Link
							href={`/models/${model.id}`}
							className="inline-flex min-w-0 items-center gap-2 underline decoration-transparent transition-colors hover:text-primary hover:decoration-current"
						>
							<ProviderLogo
								id={model.provider.provider_id}
								alt={model.provider.name}
								size="md"
								className="shrink-0"
							/>
							<span className="truncate">{model.name}</span>
						</Link>
					</span>
				))}
			</h1>
			<p className="hidden sm:block text-sm text-muted-foreground">
				Pricing, gateway usage, availability, and benchmark comparison.
			</p>
		</section>
	);
}

