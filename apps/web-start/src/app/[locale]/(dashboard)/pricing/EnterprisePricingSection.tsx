import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnterpriseSeatCalculator } from "./EnterpriseSeatCalculator";
import { useTranslations } from "next-intl";

export function EnterprisePricingSection() {
	const t = useTranslations("Site.pricing");
	return (
		<section className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="max-w-3xl">
					<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("selfServeEnterprise")}</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">{t("selfServeEnterpriseBody")}</p>
				</div>
				<Button asChild className="h-10 shrink-0"><Link href="/settings/workspaces/enterprise">{t("buildPlan")} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
			</div>
			<EnterpriseSeatCalculator />
		</section>
	);
}
