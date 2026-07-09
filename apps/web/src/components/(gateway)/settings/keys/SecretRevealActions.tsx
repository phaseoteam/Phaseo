"use client";

import * as React from "react";
import {
	Check,
	ChevronDown,
	Copy,
	Download,
	ShieldCheck,
	TestTube2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	AI_STATS_GATEWAY_BASE_URL,
	buildAppConfigSnippets,
	buildCollectionExports,
	buildEnvFile,
} from "@/lib/gateway/secretReveal";
import { OnePasswordSaveButton } from "./OnePasswordSaveButton";

type SecretKind = "api-key" | "management-key";

type SecretRevealActionsProps = {
	secret: string;
	name: string;
	kind?: SecretKind;
	envVarName?: string;
	baseUrl?: string;
	enableTest?: boolean;
};

type CopyTextButtonProps = {
	value: string;
	children: React.ReactNode;
	onCopied?: () => void;
	variant?: React.ComponentProps<typeof Button>["variant"];
};

function downloadTextFile(filename: string, content: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CopyTextButton({
	value,
	children,
	onCopied,
	variant = "outline",
}: CopyTextButtonProps) {
	const [copied, setCopied] = React.useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
			onCopied?.();
		} catch {
			toast.error("Could not copy to clipboard");
		}
	}

	return (
		<Button type="button" variant={variant} size="sm" onClick={copy}>
			{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
			{copied ? "Copied" : children}
		</Button>
	);
}

export function SecretRevealActions({
	secret,
	name,
	kind = "api-key",
	envVarName = kind === "management-key"
		? "AI_STATS_MANAGEMENT_KEY"
		: "AI_STATS_API_KEY",
	baseUrl = AI_STATS_GATEWAY_BASE_URL,
	enableTest = kind === "api-key",
}: SecretRevealActionsProps) {
	const [testState, setTestState] = React.useState<
		"idle" | "testing" | "success" | "error"
	>("idle");
	const appConfigSnippets = React.useMemo(
		() => buildAppConfigSnippets({ apiKey: secret, baseUrl }),
		[secret, baseUrl],
	);
	const collectionExports = React.useMemo(
		() => buildCollectionExports(baseUrl),
		[baseUrl],
	);
	const envFile = React.useMemo(
		() => buildEnvFile({ apiKey: secret, baseUrl, envVarName }),
		[secret, baseUrl, envVarName],
	);
	const onePasswordUrls = React.useMemo(
		() => ["https://ai-stats.phaseo.app", "https://api.phaseo.app"],
		[],
	);

	async function testKey() {
		setTestState("testing");
		try {
			const response = await fetch("/api/internal/secret-ux/test-key", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ apiKey: secret }),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body?.ok === false) {
				throw new Error(
					body?.message || "The key could not be verified right now.",
				);
			}
			setTestState("success");
			toast.success("Key works");
		} catch (error) {
			setTestState("error");
			toast.error(
				error instanceof Error ? error.message : "Could not test API key",
			);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<CopyTextButton
					value={secret}
					variant="default"
					onCopied={() => toast.success("Copied key")}
				>
					Copy key
				</CopyTextButton>
				<CopyTextButton
					value={envFile}
					onCopied={() => toast.success("Copied .env")}
				>
					Copy .env
				</CopyTextButton>

				{kind === "api-key" ? (
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>

								Copy config
								<ChevronDown className="h-4 w-4" />

						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{appConfigSnippets.map((snippet) => (
								<DropdownMenuItem
									key={snippet.id}
									onSelect={() => {
										void navigator.clipboard
											.writeText(snippet.value)
											.then(() => toast.success(`Copied ${snippet.label}`))
											.catch(() => toast.error("Could not copy config"));
									}}
								>
									{snippet.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}

				{kind === "api-key" ? (
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>

								<Download className="h-4 w-4" />
								Export
								<ChevronDown className="h-4 w-4" />

						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{collectionExports.map((item) => (
								<DropdownMenuItem
									key={item.id}
									onSelect={() => {
										downloadTextFile(
											item.filename,
											item.content,
											item.mimeType,
										);
										toast.success(`Downloaded ${item.label} collection`);
									}}
								>
									{item.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}

				{enableTest ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={testKey}
						disabled={testState === "testing"}
					>
						{testState === "success" ? (
							<ShieldCheck className="h-4 w-4 text-emerald-600" />
						) : (
							<TestTube2 className="h-4 w-4" />
						)}
						{testState === "testing" ? "Testing..." : "Test key"}
					</Button>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<OnePasswordSaveButton
					title={name || "AI Stats API key"}
					secret={secret}
					notes={
						kind === "management-key"
							? "AI Stats management API key. Store securely and use only for management API calls."
							: "AI Stats Gateway API key. Keep server-side and rotate if exposed."
					}
					urls={onePasswordUrls}
				/>
				{kind === "api-key" ? (
					<p className="text-xs text-muted-foreground">
						Exports use placeholders so downloaded collections do not contain the
						secret.
					</p>
				) : null}
			</div>
		</div>
	);
}
