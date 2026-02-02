"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Target = "openai.responses" | "openai.chat.completions" | "anthropic.messages";

type ValidationError = {
	instancePath?: string;
	message?: string;
	keyword?: string;
	schemaPath?: string;
	params?: Record<string, unknown>;
};

type ValidationResult = {
	valid: boolean;
	errors: ValidationError[] | null;
	error?: string;
};

const TARGETS: { id: Target; label: string; description: string; source: string }[] = [
	{
		id: "openai.responses",
		label: "OpenAI Responses",
		description: "Validates a 200 JSON response against OpenAI Responses schema.",
		source: "apps/api/openapi.openai.yml",
	},
	{
		id: "openai.chat.completions",
		label: "OpenAI Chat Completions",
		description: "Validates a 200 JSON response against OpenAI Chat Completions schema.",
		source: "apps/api/openapi.openai.yml",
	},
	{
		id: "anthropic.messages",
		label: "Anthropic Messages",
		description: "Validates a 200 JSON response against Anthropic Messages schema.",
		source: "apps/api/openapi.anthropic.json",
	},
];

function formatPointer(path: string | undefined) {
	if (!path) return "$";
	const dotted = path
		.replaceAll("/", ".")
		.replace(/\.(\d+)/g, "[$1]");
	return `$${dotted}`;
}

function emptyState(): Record<Target, ValidationResult | null> {
	return {
		"openai.responses": null,
		"openai.chat.completions": null,
		"anthropic.messages": null,
	};
}

export default function CompatibilityClient() {
	const [payloads, setPayloads] = useState<Record<Target, string>>({
		"openai.responses": "",
		"openai.chat.completions": "",
		"anthropic.messages": "",
	});
	const [results, setResults] = useState<Record<Target, ValidationResult | null>>(
		emptyState(),
	);
	const [loading, setLoading] = useState<Record<Target, boolean>>({
		"openai.responses": false,
		"openai.chat.completions": false,
		"anthropic.messages": false,
	});

	const tabs = useMemo(() => TARGETS, []);

	const updatePayload = (target: Target, value: string) => {
		setPayloads((prev) => ({ ...prev, [target]: value }));
	};

	const validatePayload = async (target: Target) => {
		setLoading((prev) => ({ ...prev, [target]: true }));
		setResults((prev) => ({ ...prev, [target]: null }));
		try {
			const raw = payloads[target].trim();
			if (!raw) {
				setResults((prev) => ({
					...prev,
					[target]: { valid: false, errors: [], error: "Paste a JSON response to validate." },
				}));
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				setResults((prev) => ({
					...prev,
					[target]: {
						valid: false,
						errors: [],
						error: error instanceof Error ? error.message : "Invalid JSON",
					},
				}));
				return;
			}

			const response = await fetch("/api/internal/compatibility/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ target, payload: parsed }),
			});
			const data = (await response.json()) as ValidationResult;
			if (!response.ok) {
				setResults((prev) => ({
					...prev,
					[target]: {
						valid: false,
						errors: [],
						error: data.error ?? "Validation failed",
					},
				}));
				return;
			}

			setResults((prev) => ({ ...prev, [target]: data }));
		} finally {
			setLoading((prev) => ({ ...prev, [target]: false }));
		}
	};

	return (
		<div className="mx-4 sm:mx-8 py-6 sm:py-10">
			<div className="mb-6 sm:mb-8">
				<h1 className="text-2xl sm:text-3xl font-bold">
					Gateway Compatibility
				</h1>
				<p className="text-sm sm:text-base text-muted-foreground">
					Validate gateway responses against official OpenAI and Anthropic
					response schemas.
				</p>
			</div>

			<Tabs defaultValue={tabs[0].id} className="space-y-6">
				<TabsList className="flex flex-wrap">
					{tabs.map((tab) => (
						<TabsTrigger key={tab.id} value={tab.id}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>

				{tabs.map((tab) => {
					const result = results[tab.id];
					const isLoading = loading[tab.id];
					return (
						<TabsContent key={tab.id} value={tab.id} className="space-y-6">
							<Card>
								<CardHeader className="space-y-2">
									<CardTitle>{tab.label}</CardTitle>
									<CardDescription>{tab.description}</CardDescription>
									<div className="flex flex-wrap items-center gap-2 text-xs">
										<Badge variant="outline">Schema source</Badge>
										<span className="text-muted-foreground">{tab.source}</span>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<Textarea
										value={payloads[tab.id]}
										onChange={(event) =>
											updatePayload(tab.id, event.target.value)
										}
										placeholder="Paste the JSON response to validate."
										className="min-h-[240px] font-mono text-xs leading-relaxed"
									/>
									<div className="flex flex-wrap gap-3">
										<Button
											onClick={() => validatePayload(tab.id)}
											disabled={isLoading}
										>
											{isLoading ? "Validating..." : "Validate Response"}
										</Button>
										{result?.valid && (
											<Badge className="bg-emerald-500/15 text-emerald-700">
												Valid
											</Badge>
										)}
										{result && !result.valid && (
											<Badge variant="destructive">Invalid</Badge>
										)}
									</div>
								</CardContent>
							</Card>

							{result?.error && (
								<Alert variant="destructive">
									<AlertTitle>Validation failed</AlertTitle>
									<AlertDescription>
										{result.error}
									</AlertDescription>
								</Alert>
							)}

							{result && !result.valid && !result.error && (
								<Card className="border-destructive/40">
									<CardHeader>
										<CardTitle className="text-base">
											Schema issues
										</CardTitle>
										<CardDescription>
											{result.errors?.length ?? 0} issue(s) detected.
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										<div className="space-y-2 text-sm">
											{result.errors?.map((err, index) => (
												<div
													key={`${err.instancePath ?? "root"}-${index}`}
													className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
												>
													<div className="font-mono text-xs text-destructive/90">
														{formatPointer(err.instancePath)}
													</div>
													<div className="text-sm text-foreground">
														{err.message ?? "Schema violation"}
													</div>
													{err.keyword && (
														<div className="text-xs text-muted-foreground">
															Rule: {err.keyword}
														</div>
													)}
												</div>
											))}
										</div>
									</CardContent>
								</Card>
							)}
						</TabsContent>
					);
				})}
			</Tabs>
		</div>
	);
}

