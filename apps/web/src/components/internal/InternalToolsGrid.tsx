"use client";

import Link from "next/link";
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
	Zap,
	GitCompare,
} from "lucide-react";

const internalTools = [
	{
		id: "data-editor",
		title: "Data Editor",
		description:
			"Manage models, organisations, API providers, and benchmarks from dedicated CRUD pages.",
		icon: FileCheck,
		href: "/internal/data",
		comingSoon: false,
	},
	{
		id: "data-audit",
		title: "Data Audit",
		description:
			"Audit model/provider coverage with advanced filters for gateway activity, benchmarks, and pricing.",
		icon: BarChart3,
		href: "/internal/audit",
		comingSoon: false,
	},
	{
		id: "api-model-conflicts",
		title: "API Model Conflicts",
		description:
			"Detect likely model ID alias conflicts and pricing folder mismatches across providers.",
		icon: GitCompare,
		href: "/internal/api-model-conflicts",
		comingSoon: false,
	},
	{
		id: "compatibility",
		title: "Gateway Compatibility",
		description:
			"Validate gateway responses against official OpenAI and Anthropic response schemas.",
		icon: FileCheck,
		href: "/internal/compatibility",
		comingSoon: false,
	},
	{
		id: "latency-comparison",
		title: "Latency Comparison",
		description:
			"Compare response times between gateway and direct providers with live streaming diagnostics.",
		icon: Zap,
		href: "/tools/latency-comparison",
		comingSoon: false,
	},
	{
		id: "analytics",
		title: "Internal Analytics",
		description:
			"Deep analytics and insights into model usage, performance, and trends.",
		icon: BarChart3,
		href: "/internal/analytics",
		comingSoon: true,
	},
	{
		id: "admin",
		title: "Admin Panel",
		description:
			"Manage users, permissions, and system settings.",
		icon: Shield,
		href: "/internal/admin",
		comingSoon: true,
	},
	{
		id: "database",
		title: "Database Tools",
		description:
			"Database management, migrations, and maintenance utilities.",
		icon: Database,
		href: "/internal/database",
		comingSoon: true,
	},
	{
		id: "users",
		title: "User Management",
		description:
			"View and manage user accounts, roles, and access control.",
		icon: Users,
		href: "/internal/users",
		comingSoon: true,
	},
	{
		id: "config",
		title: "System Configuration",
		description:
			"Configure system settings, feature flags, and integrations.",
		icon: Settings,
		href: "/internal/config",
		comingSoon: true,
	},
];

export default function InternalToolsGrid() {
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
										{tool.title}
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="mb-4">
								{tool.description}
							</CardDescription>
							<Link
								href={tool.href}
								className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-4 rounded-md text-center block transition-colors"
							>
								Open Tool
							</Link>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
