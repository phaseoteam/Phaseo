"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Database,
	Shield,
	BarChart3,
	Settings,
	FileCheck,
	Users,
	GitCompare,
	RefreshCcw,
	Gift,
	Bell,
	Gauge,
	FlaskConical,
	Languages,
} from "lucide-react";

const internalTools = [
	{
		id: "localisation-preview",
		titleKey: "localisationPreviewTitle",
		descriptionKey: "localisationPreviewDescription",
		icon: Languages,
		href: "/internal/localisation-preview",
		comingSoon: false,
	},
	{
		id: "realtime-billing", titleKey: "realtimeBillingTitle", descriptionKey: "realtimeBillingDescription",
		icon: Shield, href: "/internal/realtime-billing", comingSoon: false,
	},
	{
		id: "model-test-playground",
		titleKey: "modelTestLabTitle",
		descriptionKey: "modelTestLabDescription",
		icon: FlaskConical,
		href: "/internal/model-test-playground",
		comingSoon: false,
	},
	{
		id: "data-editor",
		titleKey: "dataEditorTitle",
		descriptionKey: "dataEditorDescription",
		icon: FileCheck,
		href: "/internal/data",
		comingSoon: false,
	},
	{
		id: "data-audit",
		titleKey: "dataAuditTitle",
		descriptionKey: "dataAuditDescription",
		icon: BarChart3,
		href: "/internal/audit",
		comingSoon: false,
	},
	{
		id: "api-model-conflicts",
		titleKey: "apiModelConflictsTitle",
		descriptionKey: "apiModelConflictsDescription",
		icon: GitCompare,
		href: "/internal/api-model-conflicts",
		comingSoon: false,
	},
	{
		id: "compatibility",
		titleKey: "gatewayCompatibilityTitle",
		descriptionKey: "gatewayCompatibilityDescription",
		icon: FileCheck,
		href: "/internal/compatibility",
		comingSoon: false,
	},
	{
		id: "cache-ops",
		titleKey: "cacheControlCentreTitle",
		descriptionKey: "cacheControlCentreDescription",
		icon: RefreshCcw,
		href: "/internal/cache",
		comingSoon: false,
	},
	{
		id: "security-reports",
		titleKey: "securityReportsTitle",
		descriptionKey: "securityReportsDescription",
		icon: Shield,
		href: "/internal/security-reports",
		comingSoon: false,
	},
	{
		id: "promo-credits",
		titleKey: "promoCreditsTitle",
		descriptionKey: "promoCreditsDescription",
		icon: Gift,
		href: "/internal/credits",
		comingSoon: false,
	},
	{
		id: "model-discovery-notifier",
		titleKey: "modelDiscoveryNotifierTitle",
		descriptionKey: "modelDiscoveryNotifierDescription",
		icon: Bell,
		href: "/internal/model-discovery-notifier",
		comingSoon: false,
	},
	{
		id: "gateway-benchmark",
		titleKey: "gatewayBenchmarkTitle",
		descriptionKey: "gatewayBenchmarkDescription",
		icon: Gauge,
		href: "/internal/gateway-benchmark",
		comingSoon: true,
	},
	{
		id: "analytics",
		titleKey: "internalAnalyticsTitle",
		descriptionKey: "internalAnalyticsDescription",
		icon: BarChart3,
		href: "/internal/analytics",
		comingSoon: true,
	},
	{
		id: "admin",
		titleKey: "adminPanelTitle",
		descriptionKey: "adminPanelDescription",
		icon: Shield,
		href: "/internal/admin",
		comingSoon: true,
	},
	{
		id: "database",
		titleKey: "databaseToolsTitle",
		descriptionKey: "databaseToolsDescription",
		icon: Database,
		href: "/internal/database",
		comingSoon: true,
	},
	{
		id: "users",
		titleKey: "userManagementTitle",
		descriptionKey: "userManagementDescription",
		icon: Users,
		href: "/internal/users",
		comingSoon: true,
	},
	{
		id: "config",
		titleKey: "systemConfigurationTitle",
		descriptionKey: "systemConfigurationDescription",
		icon: Settings,
		href: "/internal/config",
		comingSoon: true,
	},
];

export default function InternalToolsGrid() {
	const t = useTranslations("Product.internalTools");
	const availableTools = internalTools.filter((tool) => !tool.comingSoon);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{availableTools.map((tool) => {
				const Icon = tool.icon;
				return (
					<Card
						key={tool.id}
						className="hover:shadow-lg transition-shadow"
					>
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Icon className="h-6 w-6 text-primary" />
								</div>
								<div className="flex-1">
									<CardTitle className="text-lg">
										{t(tool.titleKey as never)}
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="mb-4">
								{t(tool.descriptionKey as never)}
							</CardDescription>
							<Link
								href={tool.href}
								className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-4 rounded-md text-center block transition-colors"
							>
								{t("openTool")}
							</Link>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
