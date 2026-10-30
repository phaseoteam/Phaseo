"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchInternalWebApi } from "@/lib/web-api/client";

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

const TARGETS: { id: Target; label: string; source: string }[] = [
	{
		id: "openai.responses",
		label: "OpenAI Responses",
		source: "apps/api/openapi.openai.yml",
	},
	{
		id: "openai.chat.completions",
		label: "OpenAI Chat Completions",
		source: "apps/api/openapi.openai.yml",
	},
	{
		id: "anthropic.messages",
		label: "Anthropic Messages",
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
	const t = useTranslations("Product.internalTools.compatibility");
	const validationErrorMessage = (error: ValidationError) => {
		const params = error.params ?? {};
		switch (error.keyword) {
			case "required":
				return t("missingProperty", {
					property: String(params.missingProperty ?? ""),
				});
			case "type":
				return t("expectedType", { type: String(params.type ?? "") });
			case "additionalProperties":
				return t("unexpectedProperty", {
					property: String(params.additionalProperty ?? ""),
				});
			case "enum":
				return t("invalidOption");
			default:
				return t("schemaViolation");
		}
	};
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
					[target]: { valid: false, errors: [], error: t("pasteResponseFirst") },
				}));
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				setResults((prev) => ({
					...prev,
					[target]: {
						valid: false,
						errors: [],
						error: t("invalidJson"),
					},
				}));
				return;
			}

			let data: ValidationResult;
			try {
				data = await fetchInternalWebApi<ValidationResult>("/api/internal/compatibility/validate", (await getBrowserAccessToken()) ?? "", { method: "POST", body: JSON.stringify({ target, payload: parsed }) });
			} catch {
				setResults((prev) => ({
					...prev,
					[target]: {
						valid: false,
						errors: [],
						error: t("requestFailed"),
					},
				}));
				return;
			}

			setResults((prev) => ({
				...prev,
				[target]: data.error ? { ...data, error: t("requestFailed") } : data,
			}));
		} finally {
			setLoading((prev) => ({ ...prev, [target]: false }));
		}
	};

	return (
		<div className="mx-4 sm:mx-8 py-6 sm:py-10">
			<div className="mb-6 sm:mb-8">
				<h1 className="text-2xl sm:text-3xl font-bold">
					{t("pageTitle")}
				</h1>
				<p className="text-sm sm:text-base text-muted-foreground">
					{t("pageDescription")}
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
									<CardDescription>{t("targetDescription", { target: tab.label })}</CardDescription>
									<div className="flex flex-wrap items-center gap-2 text-xs">
										<Badge variant="outline">{t("schemaSource")}</Badge>
										<span className="text-muted-foreground">{tab.source}</span>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<Textarea
										value={payloads[tab.id]}
										onChange={(event) =>
											updatePayload(tab.id, event.target.value)
										}
										placeholder={t("pasteResponsePlaceholder")}
										className="min-h-[240px] font-mono text-xs leading-relaxed"
									/>
									<div className="flex flex-wrap gap-3">
										<Button
											onClick={() => validatePayload(tab.id)}
											disabled={isLoading}
										>
											{isLoading ? t("validating") : t("validateResponse")}
										</Button>
										{result?.valid && (
											<Badge className="bg-emerald-500/15 text-emerald-700">
												{t("valid")}
											</Badge>
										)}
										{result && !result.valid && (
											<Badge variant="destructive">{t("invalid")}</Badge>
										)}
									</div>
								</CardContent>
							</Card>

							{result?.error && (
								<Alert variant="destructive">
									<AlertTitle>{t("validationFailed")}</AlertTitle>
									<AlertDescription>
										{result.error}
									</AlertDescription>
								</Alert>
							)}

							{result && !result.valid && !result.error && (
								<Card className="border-destructive/40">
									<CardHeader>
										<CardTitle className="text-base">
											{t("schemaIssues")}
										</CardTitle>
										<CardDescription>
											{t("issueCount", { count: result.errors?.length ?? 0 })}
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
												{validationErrorMessage(err)}
													</div>
													{err.keyword && (
														<div className="text-xs text-muted-foreground">
												{t("rule", { keyword: err.keyword })}
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
