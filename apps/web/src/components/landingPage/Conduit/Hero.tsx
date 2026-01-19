"use client";

import Link from "next/link";
import { Activity, BarChart3, Boxes, Network, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { WordRotate } from "@/components/ui/word-rotate";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<Card className="h-full gap-0 p-4 flex flex-col items-center justify-between border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 cursor-pointer">
			<CardHeader className="text-center p-0 w-full">
				<div className="flex-1 flex items-center justify-center">
					<CardTitle className="text-3xl font-bold">
						{value}
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="w-full flex items-end justify-center p-0">
				<span className="text-sm font-medium text-center text-gray-500">
					{label}
				</span>
			</CardContent>
		</Card>
	);
}

export function Hero() {
	const heroStats = [
		{
			label: "24h uptime",
			value: "99.97%",
			icon: Activity,
			accent: "#0ea5e9",
		},
		{
			label: "24h tokens",
			value: "2.4B+",
			icon: BarChart3,
			accent: "#14b8a6",
		},
		{
			label: "Models",
			value: "1,450+",
			icon: Boxes,
			accent: "#f59e0b",
		},
		{
			label: "Providers",
			value: "120+",
			icon: Network,
			accent: "#6366f1",
		},
	];

	const popularModels: ModelCardType[] = [
		{
			model_id: "openai/gpt-4o-2024-11-20",
			name: "GPT-4o",
			organisation_id: "openai",
			organisation_name: "OpenAI",
			organisation_colour: "#0f172a",
			primary_date: null,
			primary_timestamp: null,
			primary_group_key: null,
		},
		{
			model_id: "anthropic/claude-3-5-sonnet-2024-10-22",
			name: "Claude 3.5 Sonnet",
			organisation_id: "anthropic",
			organisation_name: "Anthropic",
			organisation_colour: "#f97316",
			primary_date: null,
			primary_timestamp: null,
			primary_group_key: null,
		},
		{
			model_id: "google/gemini-1-5-pro-002-2024-09-24",
			name: "Gemini 1.5 Pro",
			organisation_id: "google",
			organisation_name: "Google",
			organisation_colour: "#3b82f6",
			primary_date: null,
			primary_timestamp: null,
			primary_group_key: null,
		},
		{
			model_id: "mistral/mistral-large-2-1-2024-11-18",
			name: "Mistral Large",
			organisation_id: "mistral",
			organisation_name: "Mistral",
			organisation_colour: "#ef4444",
			primary_date: null,
			primary_timestamp: null,
			primary_group_key: null,
		},
	];

	return (
		<section
			className="flex flex-col items-center justify-center"
			style={{ paddingTop: 64 }}
		>
			<div className="mx-auto w-full px-6 lg:px-8 text-center">
				<div className="space-y-12">
					<h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
						The Single API For{" "}
						<WordRotate
							words={[
								"AI Models",
								"LLMs",
								"Vision",
								"Audio",
								"Embeddings",
								"Agents",
							]}
							duration={5000}
							className="inline-block"
						/>
					</h1>

					<div className="flex flex-wrap items-center justify-center gap-4">
						<Button
							asChild
							size="lg"
							className="bg-slate-900 text-white hover:bg-slate-800"
						>
							<Link href={SALES_HREF}>
								Create free account{" "}
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild size="lg" variant="outline">
							<Link href={DOCS_HREF}>Read the quickstart</Link>
						</Button>
					</div>

					<div className="flex justify-center w-full">
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 container max-w-5xl">
							{heroStats.map((s) => (
								<Stat
									key={s.label}
									label={s.label}
									value={s.value}
								/>
							))}
						</div>
					</div>

					<div className="w-full flex justify-center">
						<Card className="shadow-sm border-t-2 container">
							<CardHeader className="pb-3">
								<CardTitle className="text-base">
									Popular models
								</CardTitle>
								<CardDescription>
									Same integration, access the models your
									team already trusts.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
									{popularModels.map((model) => (
										<ModelCard
											key={model.model_id}
											model={model}
										/>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</section>
	);
}
