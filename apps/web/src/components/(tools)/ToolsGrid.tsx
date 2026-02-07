"use client";

import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FileText, Calculator, Code, Terminal, DollarSign } from "lucide-react";

const tools = [
        {
                id: "markdown-preview",
                title: "Markdown Previewer",
                description: "Preview and render Markdown content in real-time.",
		icon: FileText,
		href: "/tools/markdown-preview",
		comingSoon: false,
	},
        {
                id: "request-builder",
                title: "Request Builder",
                description:
                        "Build API requests interactively and generate code snippets.",
                icon: Terminal,
                href: "/tools/request-builder",
                comingSoon: false,
        },

	// {
	// 	id: "tokenizer",
	// 	title: "Token Counter",
	// 	description: "Estimate token usage for text with various AI models.",
	// 	icon: Calculator,
	// 	href: "/tools/tokenizer",
	// 	comingSoon: false,
	// },
	{
		id: "json-formatter",
		title: "JSON Formatter",
		description: "Format, validate, and beautify JSON data.",
		icon: Code,
		href: "/tools/json-formatter",
		comingSoon: false,
	},
	{
		id: "pricing-calculator",
		title: "Pricing Calculator",
		description: "Calculate costs for AI model usage across different providers.",
		icon: DollarSign,
		href: "/tools/pricing-calculator",
		comingSoon: false,
	},
];

export default function ToolsGrid() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{tools.map((tool) => {
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
								<div>
									<CardTitle className="text-lg">
										{tool.title}
									</CardTitle>
									{tool.comingSoon && (
										<span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
											Coming Soon
										</span>
									)}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<CardDescription className="mb-4">
								{tool.description}
							</CardDescription>
							{tool.comingSoon ? (
								<button
									disabled
									className="w-full bg-muted text-muted-foreground py-2 px-4 rounded-md cursor-not-allowed"
								>
									Coming Soon
								</button>
							) : (
								<Link
									href={tool.href}
									className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-4 rounded-md text-center block transition-colors"
								>
									Open Tool
								</Link>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
