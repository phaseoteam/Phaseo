import { ExtendedModel, Price } from "@/data/types";
import ModelPriceCard from "@/components/(data)/prices/APIProviderPriceCard";
import Image from "next/image";

interface ModelAPIProvidersProps {
	model: ExtendedModel;
}

// Note: allModels is currently unused but included for future extensibility
export default function ModelAPIProviders({ model }: ModelAPIProvidersProps) {
	if (!model.prices || model.prices.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
				<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
					<span className="text-xl">🤝</span>
				</div>
				<p className="text-base font-medium">
					No API provider pricing available yet
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					We&apos;re continuously adding providers. Have pricing info
					to share?
				</p>
				<div className="mt-3">
					<a
						href="https://github.com/AI-Stats/AI-Stats"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
					>
						Contribute on GitHub
						<Image
							src="/social/github_light.svg"
							alt="GitHub Logo"
							width={16}
							height={16}
							className="inline dark:hidden"
						/>
						<Image
							src="/social/github_dark.svg"
							alt="GitHub Logo"
							width={16}
							height={16}
							className="hidden dark:inline"
						/>
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold mb-2">
				API Providers & Pricing
			</h3>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<ModelPriceCard model={model} />
			</div>
		</div>
	);
}
