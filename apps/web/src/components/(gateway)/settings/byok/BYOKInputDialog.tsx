"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
	getProviderCredentialFormKind,
	getProviderCredentialLabel,
	getProviderKeyFormatExample,
	getProviderKeyFormatHint,
	getProviderKeyInputInstruction,
	getProviderKeyOnboarding,
	validateProviderKeyFormat,
} from "@/lib/byok/providerKeyValidation";

import {
	createByokKeyAction,
	updateByokKeyAction,
} from "@/app/(dashboard)/settings/byok/actions";

type Props = {
	providerId?: string;
	providerName?: string;
	triggerLabel?: string;
	trigger?: React.ReactNode;
	initial?: {
		id: string;
		providerId: string;
		name?: string;
		value?: string;
		prefix?: string;
		suffix?: string;
		enabled?: boolean;
		always_use?: boolean;
	} | null;
};

type AzureDeploymentForm = {
	id: string;
	modelSlug: string;
	endpointUrl: string;
	apiKey: string;
	modelId: string;
};

function maskFromValue(v: string) {
	const start = 6;
	const end = 4;
	if (!v) return "(value not available)";
	if (v.length <= start + end) return "*".repeat(Math.max(6, v.length));
	return `${v.slice(0, start)}${"*".repeat(Math.max(6, v.length - start - end))}${v.slice(-end)}`;
}

function createEmptyAzureDeployment(): AzureDeploymentForm {
	return {
		id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		modelSlug: "",
		endpointUrl: "",
		apiKey: "",
		modelId: "",
	};
}

export default function BYOKInputDialog({
	providerId,
	providerName,
	triggerLabel = "Set key",
	trigger,
	initial = null,
}: Props) {
	const activeProviderId = providerId ?? initial?.providerId ?? null;
	const credentialFormKind = useMemo(
		() => getProviderCredentialFormKind(activeProviderId),
		[activeProviderId],
	);
	const defaultName = useMemo(
		() => initial?.name ?? providerName ?? providerId ?? "API Key",
		[initial?.name, providerId, providerName],
	);
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [bedrockUseIam, setBedrockUseIam] = useState(false);
	const [bedrockApiKey, setBedrockApiKey] = useState("");
	const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState("");
	const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState("");
	const [bedrockRegion, setBedrockRegion] = useState("");
	const [cloudflareAccountId, setCloudflareAccountId] = useState("");
	const [cloudflareApiToken, setCloudflareApiToken] = useState("");
	const [azureDeployments, setAzureDeployments] = useState<AzureDeploymentForm[]>([
		createEmptyAzureDeployment(),
	]);
	const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
	const [alwaysUse, setAlwaysUse] = useState<boolean>(initial?.always_use ?? false);
	const [loading, setLoading] = useState(false);
	const submission = useMemo(() => {
		const generic = value.trim();

		if (credentialFormKind === "bedrock") {
			if (!bedrockUseIam) {
				const apiKey = bedrockApiKey.trim();
				return apiKey ? { value: apiKey, error: null as string | null } : { value: null, error: null as string | null };
			}

			const accessKeyId = bedrockAccessKeyId.trim();
			const secretAccessKey = bedrockSecretAccessKey.trim();
			const region = bedrockRegion.trim();
			const hasAny = Boolean(accessKeyId || secretAccessKey || region);
			if (!hasAny) return { value: null, error: null as string | null };
			if (!accessKeyId || !secretAccessKey || !region) {
				return { value: null, error: "Bedrock IAM credentials require access key ID, secret access key, and region." };
			}
			return {
				value: JSON.stringify({ accessKeyId, secretAccessKey, region }),
				error: null as string | null,
			};
		}

		if (credentialFormKind === "cloudflare") {
			const accountId = cloudflareAccountId.trim();
			const apiToken = cloudflareApiToken.trim();
			const hasAny = Boolean(accountId || apiToken);
			if (!hasAny) return { value: null, error: null as string | null };
			if (!accountId || !apiToken) {
				return { value: null, error: "Cloudflare credentials require both account ID and API token." };
			}
			return {
				value: JSON.stringify({ accountId, apiToken }),
				error: null as string | null,
			};
		}

		if (credentialFormKind === "azure_deployments") {
			const deployments = azureDeployments
				.map((dep) => ({
					modelSlug: dep.modelSlug.trim(),
					endpointUrl: dep.endpointUrl.trim(),
					apiKey: dep.apiKey.trim(),
					modelId: dep.modelId.trim(),
				}))
				.filter((dep) => dep.modelSlug || dep.endpointUrl || dep.apiKey || dep.modelId);

			if (deployments.length === 0) return { value: null, error: null as string | null };
			const hasMissing = deployments.some(
				(dep) => !dep.modelSlug || !dep.endpointUrl || !dep.apiKey || !dep.modelId,
			);
			if (hasMissing) {
				return { value: null, error: "Each Azure deployment needs model slug, endpoint URL, API key, and model ID." };
			}
			return {
				value: JSON.stringify({ deployments }),
				error: null as string | null,
			};
		}

		return generic ? { value: generic, error: null as string | null } : { value: null, error: null as string | null };
	}, [
		azureDeployments,
		bedrockAccessKeyId,
		bedrockApiKey,
		bedrockRegion,
		bedrockSecretAccessKey,
		bedrockUseIam,
		cloudflareAccountId,
		cloudflareApiToken,
		credentialFormKind,
		value,
	]);

	const formatCheck = useMemo(() => {
		if (!submission.value) return null;
		return validateProviderKeyFormat(activeProviderId, submission.value);
	}, [activeProviderId, submission.value]);
	const canSubmit = initial
		? (submission.value === null && !submission.error) || (submission.value !== null && !submission.error && Boolean(formatCheck?.ok))
		: submission.value !== null && !submission.error && Boolean(formatCheck?.ok);
	const credentialLabel = useMemo(
		() => getProviderCredentialLabel(activeProviderId),
		[activeProviderId],
	);
	const formatHint = useMemo(() => getProviderKeyFormatHint(activeProviderId), [activeProviderId]);
	const inputInstruction = useMemo(
		() => getProviderKeyInputInstruction(activeProviderId),
		[activeProviderId],
	);
	const formatExample = useMemo(() => getProviderKeyFormatExample(activeProviderId), [activeProviderId]);
	const onboarding = useMemo(
		() => getProviderKeyOnboarding(activeProviderId, providerName),
		[activeProviderId, providerName],
	);
	const providerModelsHref = activeProviderId
		? `/api-providers/${encodeURIComponent(activeProviderId)}`
		: null;
	const replacePlaceholder = formatExample
		? `Leave blank to keep existing key. ${formatExample}`
		: "Leave blank to keep the existing key value";
	const createPlaceholder = formatExample
		? formatExample
		: "Paste your API key or secret...";

	function resetForm() {
		setValue("");
		setBedrockUseIam(false);
		setBedrockApiKey("");
		setBedrockAccessKeyId("");
		setBedrockSecretAccessKey("");
		setBedrockRegion("");
		setCloudflareAccountId("");
		setCloudflareApiToken("");
		setAzureDeployments([createEmptyAzureDeployment()]);
		setEnabled(initial?.enabled ?? true);
		setAlwaysUse(initial?.always_use ?? false);
	}

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		if (submission.error) {
			toast.error(submission.error);
			return;
		}
		if (!initial && !submission.value) {
			toast.error("Please provide a key value");
			return;
		}
		if (!initial && !providerId) {
			toast.error("Missing provider id");
			return;
		}
		if (submission.value && formatCheck && !formatCheck.ok) {
			toast.error(formatCheck.message);
			return;
		}

		try {
			setLoading(true);
			if (initial && initial.id) {
				await updateByokKeyAction(initial.id, {
					name: defaultName,
					value: submission.value ?? undefined,
					enabled,
					always_use: alwaysUse,
				});
				toast.success(submission.value ? "Key updated and replaced" : "Key updated");
			} else {
				const result = await createByokKeyAction(
					defaultName,
					providerId as string,
					submission.value as string,
					enabled,
					alwaysUse,
				);
				toast.success(result?.mode === "updated" ? "Provider key replaced" : "Key saved");
			}
			setOpen(false);
			resetForm();
		} catch (err: any) {
			console.error(err);
			toast.error(err?.message || "Failed to save key");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => {
			setOpen(nextOpen);
			if (nextOpen) resetForm();
		}}>
			<DialogTrigger asChild>
				{trigger ? (
					trigger
				) : (
					<Button variant="outline" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
						{triggerLabel}
					</Button>
				)}
			</DialogTrigger>

			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{initial ? "Manage provider key" : "Set provider key"}</DialogTitle>
				</DialogHeader>

				<form onSubmit={onSave} className="grid gap-4">
					{providerModelsHref ? (
						<div className="text-xs text-muted-foreground">
							<Link
								href={providerModelsHref}
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2 hover:text-foreground"
							>
								View valid models
							</Link>
						</div>
					) : null}

					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor="value">{initial ? `Replace ${credentialLabel} (optional)` : credentialLabel}</Label>
							<HoverCard>
								<HoverCardTrigger asChild>
									<span
										className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-help select-none"
										aria-label="Credential setup info"
									>
										<Info className="h-3.5 w-3.5" />
										<span>Info</span>
									</span>
								</HoverCardTrigger>
								<HoverCardContent align="end" className="max-w-sm">
									<div className="grid gap-2 text-xs">
										<div>{onboarding.intro}</div>
										{onboarding.docsUrl ? (
											<div>
												See{" "}
												<Link
													href={onboarding.docsUrl}
													target={onboarding.docsUrl.startsWith("http") ? "_blank" : undefined}
													rel={onboarding.docsUrl.startsWith("http") ? "noreferrer" : undefined}
													className="underline underline-offset-2 hover:text-foreground"
												>
													{onboarding.docsLabel}
												</Link>{" "}
												for more information.
											</div>
										) : null}
									</div>
								</HoverCardContent>
							</HoverCard>
						</div>
						{initial ? (
							<div className="rounded-md border bg-muted/5 p-2 font-mono text-sm">
								{initial.prefix || initial.suffix
									? `${initial.prefix ?? ""}${"*".repeat(6)}${initial.suffix ?? ""}`
									: initial.value
										? maskFromValue(initial.value)
										: "(value not available)"}
							</div>
						) : null}

						{credentialFormKind === "bedrock" ? (
							<div className="space-y-3 rounded-md border p-3">
								<div className="flex items-center justify-between gap-4">
									<div className="text-sm font-medium">Use IAM credentials</div>
									<Switch
										checked={bedrockUseIam}
										onCheckedChange={(checked: any) => setBedrockUseIam(Boolean(checked))}
									/>
								</div>
								{bedrockUseIam ? (
									<div className="grid gap-2">
										<Input
											value={bedrockAccessKeyId}
											onChange={(e) => setBedrockAccessKeyId(e.target.value)}
											placeholder="Access Key ID"
										/>
										<Input
											value={bedrockSecretAccessKey}
											onChange={(e) => setBedrockSecretAccessKey(e.target.value)}
											placeholder="Secret Access Key"
										/>
										<Input
											value={bedrockRegion}
											onChange={(e) => setBedrockRegion(e.target.value)}
											placeholder="AWS Region (for example us-east-1)"
										/>
									</div>
								) : (
									<Input
										type="password"
										value={bedrockApiKey}
										onChange={(e) => setBedrockApiKey(e.target.value)}
										placeholder="Bedrock API key"
									/>
								)}
								{initial ? (
									<p className="text-xs text-muted-foreground">
										Leave all fields blank to keep existing credentials.
									</p>
								) : null}
							</div>
						) : credentialFormKind === "cloudflare" ? (
							<div className="grid gap-2 rounded-md border p-3">
								<Input
									value={cloudflareAccountId}
									onChange={(e) => setCloudflareAccountId(e.target.value)}
									placeholder="Cloudflare Account ID"
								/>
								<Input
									type="password"
									value={cloudflareApiToken}
									onChange={(e) => setCloudflareApiToken(e.target.value)}
									placeholder="Cloudflare API Token"
								/>
								{initial ? (
									<p className="text-xs text-muted-foreground">
										Leave both fields blank to keep existing credentials.
									</p>
								) : null}
							</div>
						) : credentialFormKind === "azure_deployments" ? (
							<div className="space-y-2 rounded-md border p-3">
								{azureDeployments.map((deployment, idx) => (
									<div key={deployment.id} className="rounded-md border p-2 space-y-2">
										<div className="flex items-center justify-between">
											<div className="text-xs font-medium text-muted-foreground">
												Deployment {idx + 1}
											</div>
											{azureDeployments.length > 1 ? (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() =>
														setAzureDeployments((prev) =>
															prev.filter((item) => item.id !== deployment.id),
														)
													}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											) : null}
										</div>
										<Input
											value={deployment.modelSlug}
											onChange={(e) =>
												setAzureDeployments((prev) =>
													prev.map((item) =>
														item.id === deployment.id
															? { ...item, modelSlug: e.target.value }
															: item,
													),
												)
											}
											placeholder="AI Stats model slug (for example openai/gpt-4o-mini)"
										/>
										<Input
											value={deployment.endpointUrl}
											onChange={(e) =>
												setAzureDeployments((prev) =>
													prev.map((item) =>
														item.id === deployment.id
															? { ...item, endpointUrl: e.target.value }
															: item,
													),
												)
											}
											placeholder="Azure Foundry endpoint URL"
										/>
										<Input
											type="password"
											value={deployment.apiKey}
											onChange={(e) =>
												setAzureDeployments((prev) =>
													prev.map((item) =>
														item.id === deployment.id
															? { ...item, apiKey: e.target.value }
															: item,
													),
												)
											}
											placeholder="Azure endpoint API key"
										/>
										<Input
											value={deployment.modelId}
											onChange={(e) =>
												setAzureDeployments((prev) =>
													prev.map((item) =>
														item.id === deployment.id
															? { ...item, modelId: e.target.value }
															: item,
													),
												)
											}
											placeholder="Model ID for this endpoint"
										/>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setAzureDeployments((prev) => [...prev, createEmptyAzureDeployment()])
									}
								>
									<Plus className="h-4 w-4 mr-1" />
									Add deployment
								</Button>
								{initial ? (
									<p className="text-xs text-muted-foreground">
										Leave all deployment fields blank to keep existing credentials.
									</p>
								) : null}
							</div>
						) : (
							<Textarea
								id="value"
								rows={initial ? 3 : 4}
								value={value}
								onChange={(e) => setValue(e.target.value)}
								placeholder={initial ? replacePlaceholder : createPlaceholder}
							/>
						)}
						<p className="text-xs text-muted-foreground">{inputInstruction ?? formatHint}</p>
						{submission.error ? (
							<p className="text-xs text-red-600">{submission.error}</p>
						) : null}
						{formatCheck ? (
							<p
								className={cn(
									"text-xs",
									formatCheck.ok ? "text-emerald-600" : "text-red-600",
								)}
							>
								{formatCheck.message}
							</p>
						) : null}
					</div>

					<div className="flex items-center justify-between gap-4 rounded-md border p-3">
						<div className="text-sm font-medium">Enabled</div>
						<Switch checked={enabled} onCheckedChange={(checked: any) => setEnabled(Boolean(checked))} />
					</div>

					<div className="space-y-2 rounded-md border p-3">
						<div className="flex items-center justify-between gap-4">
							<div className="text-sm font-medium">Always use this key</div>
							<Switch checked={alwaysUse} onCheckedChange={(checked: any) => setAlwaysUse(Boolean(checked))} />
						</div>
						<p className="text-xs text-muted-foreground">
							By default, if your key encounters a rate limit or failure, AI Stats falls back to shared AI Stats credits.
						</p>
						<p className="text-xs text-muted-foreground">
							When enabled, AI Stats only uses this key for requests to this provider. This can return rate-limit
							errors if your key is exhausted, but ensures requests go through your account.
						</p>
					</div>

					<DialogFooter className="gap-2">
						<Button variant="outline" type="button" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={loading || !canSubmit}>
							{loading ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
