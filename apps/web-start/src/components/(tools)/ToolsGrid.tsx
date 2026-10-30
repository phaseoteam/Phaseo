import Link from "next/link";
import { Braces, Calculator, FileText, ShieldCheck, Terminal } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

const toolGroups = [
	{
		title: "AI & API",
		description: "Inspect model outputs, requests, and costs.",
		tools: [
			{ id: "content-provenance", title: "Content Provenance", description: "Check images and audio for known OpenAI provenance signals.", icon: ShieldCheck, href: "/tools/content-provenance" },
			{ id: "pricing-calculator", title: "Pricing Calculator", description: "Estimate model request costs across providers and pricing plans.", icon: Calculator, href: "/tools/pricing-calculator" },
			{ id: "request-builder", title: "Request Builder", description: "Build API requests and export ready-to-run code snippets.", icon: Terminal, href: "/tools/request-builder" },
		],
	},
	{
		title: "Developer utilities",
		description: "Small, focused tools for everyday development work.",
		tools: [
			{ id: "json-formatter", title: "JSON Formatter", description: "Format, validate, and inspect JSON data.", icon: Braces, href: "/tools/json-formatter" },
			{ id: "markdown-preview", title: "Markdown Preview", description: "Preview rendered Markdown as you write.", icon: FileText, href: "/tools/markdown-preview" },
		],
	},
] as const;

export default function ToolsGrid() {
	const t = useTranslations("Product.tools");
	const groups = { ai: t("aiApi"), aiDescription: t("aiApiDescription"), developer: t("developerUtilities"), developerDescription: t("developerUtilitiesDescription") };
	const labels: Record<string, readonly [string, string]> = {
		"content-provenance": [t("contentProvenance"), t("contentProvenanceDescription")],
		"pricing-calculator": [t("pricingCalculator"), t("pricingCalculatorDescription")],
		"request-builder": [t("requestBuilder"), t("requestBuilderDescription")],
		"json-formatter": [t("jsonFormatter"), t("jsonFormatterDescription")],
		"markdown-preview": [t("markdownPreview"), t("markdownPreviewDescription")],
	};
	return (
		<div className="space-y-10">
			{toolGroups.map((group) => (
				<section key={group.title} aria-labelledby={`tools-${group.title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`}>
					<div className="mb-4">
						<h2 id={`tools-${group.title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`} className="text-xl font-semibold tracking-tight">{group.title === "AI & API" ? groups.ai : groups.developer}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{group.title === "AI & API" ? groups.aiDescription : groups.developerDescription}</p>
					</div>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{group.tools.map((tool) => {
							const Icon = tool.icon;
							return (
								<Link key={tool.id} href={tool.href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<Card className="h-full border-border/80 transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-md">
										<CardHeader>
											<div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-muted/30 text-primary transition-colors group-hover:bg-primary/10"><Icon className="size-5" /></div>
											<CardTitle className="text-lg">{labels[tool.id as keyof typeof labels]?.[0] ?? tool.title}</CardTitle>
											<CardDescription className="leading-relaxed">{labels[tool.id as keyof typeof labels]?.[1] ?? tool.description}</CardDescription>
										</CardHeader>
									</Card>
								</Link>
							);
						})}
					</div>
				</section>
			))}
		</div>
	);
}
