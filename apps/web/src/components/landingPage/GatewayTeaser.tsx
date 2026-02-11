// components/landingPage/GatewayTeaser.tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, ShieldCheck } from "lucide-react";

export default function GatewayTeaser({
	providers = 20,
	models = 500,
}: {
	providers?: number;
	models?: number;
}) {
	const roundDownToStep = (value: number, step: number) => {
		if (!Number.isFinite(value) || value <= 0) return 0;
		return Math.max(step, Math.floor(value / step) * step);
	};
	const providersRounded = roundDownToStep(providers, 10);
	const modelsRounded = roundDownToStep(models, 100);

	return (
		<section className="container mx-auto">
			<Card className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 md:p-6 border-dashed">
				<div className="text-left">
					<p className="text-sm text-muted-foreground mb-1">
						AI Stats Gateway
					</p>
					<h3 className="text-lg md:text-xl font-semibold">
						One API for every model. Smart routing, clear analytics,
						and BYOK.
					</h3>
					<div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
						<span className="inline-flex items-center gap-2">
							<Server size={16} /> {providersRounded}+ providers
						</span>
						<span className="inline-flex items-center gap-2">
							<ShieldCheck size={16} /> {modelsRounded}+ models
						</span>
					</div>
				</div>
				<div className="shrink-0">
					<Button asChild size="sm">
						<Link href="/gateway">Explore the Gateway</Link>
					</Button>
				</div>
			</Card>
		</section>
	);
}
