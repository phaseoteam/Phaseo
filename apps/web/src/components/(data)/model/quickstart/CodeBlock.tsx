"use client";

// src/components/code/CodeBlock.tsx
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { codeToHtmlBoth } from "./shiki";
import { CopyButton } from "@/components/ui/copy-button";
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
	const [lightHtml, setLightHtml] = useState<string | null>(null);
	const [darkHtml, setDarkHtml] = useState<string | null>(null);
	const [error, setError] = useState(false);

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

	return (
		<div className="relative group rounded-xl border bg-primary/5">
			<div className="flex items-center justify-between px-3 py-2">
				<span className="text-[11px] uppercase tracking-wide text-muted-foreground">
					{label ?? lang}
				</span>
				<CopyButton
					content={code}
					variant="outline"
					className="border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
				/>
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
