"use client";

// src/components/code/CodeBlock.tsx
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { codeToHtmlBoth } from "./shiki";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { ShikiLang } from "./shiki";

function PlainBlock({ code }: { code: string }) {
	return (
		<pre className="overflow-x-auto text-sm p-4 rounded-b-xl">
			<code>{code}</code>
		</pre>
	);
}

export default function CodeBlock({
	code,
	lang = "bash",
	label,
}: {
	code: string;
	lang?: ShikiLang;
	label?: string;
}) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const [lightHtml, setLightHtml] = useState<string | null>(null);
	const [darkHtml, setDarkHtml] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let mounted = true;

		async function highlight() {
			try {
				const res = await codeToHtmlBoth(code, lang);
				if (mounted) {
					setLightHtml(res.light);
					setDarkHtml(res.dark);
					setError(false);
				}
			} catch (err) {
				console.error("[Shiki] highlight failed:", err);
				if (mounted) {
					setError(true);
				}
			}
		}

		highlight();

		return () => {
			mounted = false;
		};
	}, [code, lang]);

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 2000);
		return () => window.clearTimeout(timer);
	}, [copied]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
		} catch (err) {
			console.error("Error copying quickstart code", err);
		}
	};

	return (
		<div className="group relative rounded-xl border border-border/70 bg-background">
			<div className="flex items-center justify-between bg-muted/30 px-3 py-2">
				<span className="text-xs font-medium text-foreground">
					{label ?? lang}
				</span>
				<Button
					type="button"
					onClick={handleCopy}
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 rounded-md border-border bg-background px-2.5 text-xs text-foreground hover:bg-muted"
				>
					{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
					{t(copied ? "copied" : "copy")}
				</Button>
			</div>
			<Separator />

			<div className="p-4 overflow-x-auto text-sm rounded-b-xl">
				{!error && lightHtml && darkHtml ? (
					<>
						{/* Light */}
						<div
							className="block dark:hidden [&_.shiki]:bg-transparent! [&_.shiki]:m-0! [&_.shiki]:p-0!"
							dangerouslySetInnerHTML={{ __html: lightHtml }}
						/>
						{/* Dark */}
						<div
							className="hidden dark:block [&_.shiki]:bg-transparent! [&_.shiki]:m-0! [&_.shiki]:p-0!"
							dangerouslySetInnerHTML={{ __html: darkHtml }}
						/>
					</>
				) : (
					<PlainBlock code={code} />
				)}
			</div>
		</div>
	);
}
