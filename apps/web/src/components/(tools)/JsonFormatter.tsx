"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";
import { ToolPageHeader } from "@/components/(tools)/ToolPageHeader";
import { useTranslations } from "next-intl";

export default function JsonFormatter() {
	const t = useTranslations("Product.tools.json");
	const [input, setInput] = useState('{"name": "John", "age": 30, "city": "New York"}');
	const [output, setOutput] = useState("");
	const [error, setError] = useState("");

	const formatJson = () => {
		try {
			const parsed = JSON.parse(input);
			const formatted = JSON.stringify(parsed, null, 2);
			setOutput(formatted);
			setError("");
		} catch (err) {
			setError(t("invalid", { message: (err as Error).message }));
			setOutput("");
		}
	};

	const minifyJson = () => {
		try {
			const parsed = JSON.parse(input);
			const minified = JSON.stringify(parsed);
			setOutput(minified);
			setError("");
		} catch (err) {
			setError(t("invalid", { message: (err as Error).message }));
			setOutput("");
		}
	};

	const validateJson = () => {
		try {
			JSON.parse(input);
			setError("");
			setOutput("✓ Valid JSON");
		} catch (err) {
			setError(t("invalid", { message: (err as Error).message }));
			setOutput("");
		}
	};

	const clearAll = () => {
		setInput("");
		setOutput("");
		setError("");
	};

	return (
		<div className="container mx-auto px-4 py-8 sm:py-12">
			<ToolPageHeader title={t("title")} description={t("description")} />

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<Card>
					<CardHeader>
						<CardTitle>{t("input")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							className="min-h-[300px] font-mono"
							placeholder={t("placeholder")}
						/>
						<div className="flex flex-wrap gap-2">
							<Button onClick={formatJson} variant="default">
								{t("format")}
							</Button>
							<Button onClick={minifyJson} variant="outline">
								{t("minify")}
							</Button>
							<Button onClick={validateJson} variant="outline">
								{t("validate")}
							</Button>
							<Button onClick={clearAll} variant="outline">
								{t("clear")}
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("output")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{error && (
							<Alert variant="destructive">
								<XCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{!error && output === "✓ Valid JSON" && (
							<Alert>
								<CheckCircle className="h-4 w-4" />
							<AlertDescription>{t("valid")}</AlertDescription>
							</Alert>
						)}
						<Textarea
							value={output}
							readOnly
							className="min-h-[300px] font-mono"
							placeholder={t("outputPlaceholder")}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
