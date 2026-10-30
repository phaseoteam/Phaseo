"use client";

import { useEffect, useMemo, useState } from "react";
import {
	AlertTriangle,
	Check,
	Cloud,
	Copy,
	FlaskConical,
	ServerCog,
	TerminalSquare,
	Wallet,
	Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	SPAWN_MANIFEST,
	getDefaultSpawnMatrixEntry,
	getSpawnMatrixEntry,
	type SpawnAgentId,
	type SpawnCloudId,
} from "@/lib/experiments/spawnManifest";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type CopyTarget = "spawn-command" | "bootstrap-command";

type CopyFeedback = {
	target: CopyTarget;
	status: "success" | "error";
	message: string;
};

function shellEscape(value: string): string {
	if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
	return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

export default function SpawnClient() {
	const t = useTranslations("Product.experiments");
	const tUi = useTranslations("Common.ui");
	const defaultMatrix = getDefaultSpawnMatrixEntry();
	const [selectedAgentId, setSelectedAgentId] = useState<SpawnAgentId>(
		SPAWN_MANIFEST.defaultAgentId,
	);
	const [selectedCloudId, setSelectedCloudId] = useState<SpawnCloudId>(
		SPAWN_MANIFEST.defaultCloudId,
	);
	const [selectedModel, setSelectedModel] = useState<string>("auto");
	const [selectedRegion, setSelectedRegion] = useState<string>("auto");
	const [selectedSize, setSelectedSize] = useState<string>("auto");
	const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

	const selectedAgent = useMemo(
		() =>
			SPAWN_MANIFEST.agents.find((agent) => agent.id === selectedAgentId) ??
			SPAWN_MANIFEST.agents[0],
		[selectedAgentId],
	);

	const cloudOptions = useMemo(
		() =>
			SPAWN_MANIFEST.clouds.filter((cloud) =>
				selectedAgent.supportedClouds.includes(cloud.id),
			),
		[selectedAgent.supportedClouds],
	);

	useEffect(() => {
		if (cloudOptions.some((cloud) => cloud.id === selectedCloudId)) return;
		setSelectedCloudId(cloudOptions[0]?.id ?? SPAWN_MANIFEST.defaultCloudId);
	}, [cloudOptions, selectedCloudId]);

	const selectedCloud = useMemo(
		() =>
			cloudOptions.find((cloud) => cloud.id === selectedCloudId) ??
			cloudOptions[0] ??
			SPAWN_MANIFEST.clouds[0],
		[cloudOptions, selectedCloudId],
	);

	const matrix = useMemo(
		() =>
			getSpawnMatrixEntry(selectedAgent.id, selectedCloud.id) ??
			getSpawnMatrixEntry(defaultMatrix.agentId, defaultMatrix.cloudId) ??
			defaultMatrix,
		[selectedAgent.id, selectedCloud.id, defaultMatrix],
	);

	useEffect(() => {
		if (selectedModel !== "auto" && !matrix.models.includes(selectedModel)) {
			setSelectedModel("auto");
		}
		if (selectedRegion !== "auto" && !matrix.regions.includes(selectedRegion)) {
			setSelectedRegion("auto");
		}
		if (selectedSize !== "auto" && !matrix.sizes.some((size) => size.id === selectedSize)) {
			setSelectedSize("auto");
		}
	}, [matrix, selectedModel, selectedRegion, selectedSize]);

	const commandArgs = useMemo(() => {
		const args: string[] = [selectedAgent.id, selectedCloud.id];
		if (selectedModel !== "auto") args.push("--model", selectedModel);
		if (selectedRegion !== "auto") args.push("--region", selectedRegion);
		if (selectedSize !== "auto") args.push("--size", selectedSize);
		return args;
	}, [selectedAgent.id, selectedCloud.id, selectedModel, selectedRegion, selectedSize]);

	const generatedCommand = useMemo(
		() =>
			[SPAWN_MANIFEST.cliBinary, ...commandArgs].map((token) => shellEscape(token)).join(" "),
		[commandArgs],
	);

	const runWithoutInstallCommand = useMemo(
		() =>
			[
				"curl",
				"-fsSL",
				shellEscape(SPAWN_MANIFEST.runWithoutInstallScriptUrl),
				"|",
				"bash",
				"-s",
				"--",
				...commandArgs.map((token) => shellEscape(token)),
			].join(" "),
		[commandArgs],
	);

	useEffect(() => {
		if (!copyFeedback) return;
		const timeout = window.setTimeout(() => setCopyFeedback(null), 2200);
		return () => window.clearTimeout(timeout);
	}, [copyFeedback]);

	async function handleCopy(target: CopyTarget, value: string) {
		if (!navigator?.clipboard?.writeText) {
			setCopyFeedback({
				target,
				status: "error",
				message: t("clipboardUnavailable"),
			});
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			setCopyFeedback({
				target,
				status: "success",
				message: t("copied"),
			});
		} catch {
			setCopyFeedback({
				target,
				status: "error",
				message: t("copyFailed"),
			});
		}
	}

	return (
		<div className="container mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-10">
			<div className="space-y-3">
				<div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
					<FlaskConical className="h-3.5 w-3.5" />
					{t("experimentTag")}
				</div>
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold tracking-tight">{t("spawnTitle")}</h1>
					<p className="max-w-5xl text-sm text-zinc-600 dark:text-zinc-300 sm:text-base">
						{t("spawnDescription")}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline">{t("byocInfrastructure")}</Badge>
					<Badge variant="outline">{t("cliAndScripts")}</Badge>
					<Badge variant="outline">{t("noProvisioningApi")}</Badge>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("boundaryBilling")}</CardTitle>
					<CardDescription>
						{t("boundaryDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
						<p className="mb-2 flex items-center gap-2 text-sm font-semibold">
							<Cloud className="h-4 w-4" />
							{t("yourCloudAccount")}
						</p>
						<p className="text-sm text-zinc-600 dark:text-zinc-300">
							{t("cloudDescription")}
						</p>
					</div>
					<div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
						<p className="mb-2 flex items-center gap-2 text-sm font-semibold">
							<Wallet className="h-4 w-4" />
							{t("phaseoBilling")}
						</p>
						<p className="text-sm text-zinc-600 dark:text-zinc-300">
							{t("phaseoBillingDescription")}
						</p>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ServerCog className="h-5 w-5" />
							{t("buildCommand")}
						</CardTitle>
						<CardDescription>
							{t("buildCommandDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="spawn-agent">{t("agent")}</Label>
								<Select
									value={selectedAgent.id}
									onValueChange={(value) => setSelectedAgentId(value as SpawnAgentId)}
								>
									<SelectTrigger id="spawn-agent">
										<SelectValue placeholder={t("selectAgent")} />
									</SelectTrigger>
									<SelectContent>
										{SPAWN_MANIFEST.agents.map((agent) => (
											<SelectItem key={agent.id} value={agent.id}>
												{agent.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedAgent.description}</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="spawn-cloud">{t("cloud")}</Label>
								<Select
									value={selectedCloud.id}
									onValueChange={(value) => setSelectedCloudId(value as SpawnCloudId)}
								>
									<SelectTrigger id="spawn-cloud">
										<SelectValue placeholder={t("selectCloud")} />
									</SelectTrigger>
									<SelectContent>
										{cloudOptions.map((cloud) => (
											<SelectItem key={cloud.id} value={cloud.id}>
												{cloud.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedCloud.description}</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="spawn-model">{t("optionalModel")}</Label>
								<Select value={selectedModel} onValueChange={setSelectedModel}>
									<SelectTrigger id="spawn-model">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
						<SelectItem value="auto">
							{tUi("requestBuilder.autoDefault", { model: matrix.defaults.model })}
						</SelectItem>
										{matrix.models.map((model) => (
											<SelectItem key={model} value={model}>
												{model}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="spawn-region">{t("optionalRegion")}</Label>
								<Select value={selectedRegion} onValueChange={setSelectedRegion}>
									<SelectTrigger id="spawn-region">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
						<SelectItem value="auto">
							{tUi("requestBuilder.autoDefault", { model: matrix.defaults.region })}
						</SelectItem>
										{matrix.regions.map((region) => (
											<SelectItem key={region} value={region}>
												{region}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="spawn-size">{t("optionalSize")}</Label>
								<Select value={selectedSize} onValueChange={setSelectedSize}>
									<SelectTrigger id="spawn-size">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="auto">
							{tUi("requestBuilder.autoDefault", {
								model:
									matrix.sizes.find((size) => size.id === matrix.defaults.size)?.label ??
									matrix.defaults.size,
							})}
										</SelectItem>
										{matrix.sizes.map((size) => (
											<SelectItem key={size.id} value={size.id}>
												{size.label} - {size.description}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-5">
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<p className="text-sm font-medium">{t("cliCommand")}</p>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => handleCopy("spawn-command", generatedCommand)}
									>
										{copyFeedback?.target === "spawn-command" &&
										copyFeedback.status === "success" ? (
											<Check className="h-4 w-4" />
										) : (
											<Copy className="h-4 w-4" />
										)}
										{t("copy")}
									</Button>
								</div>
								<pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
									<code>{generatedCommand}</code>
								</pre>
								<p
									className={cn(
										"text-xs",
										copyFeedback?.target === "spawn-command" &&
											copyFeedback.status === "error"
											? "text-red-600 dark:text-red-400"
											: "text-zinc-500 dark:text-zinc-400",
									)}
								>
									{copyFeedback?.target === "spawn-command"
										? copyFeedback.message
										: t("runsInTerminal", { binary: SPAWN_MANIFEST.cliBinary })}
								</p>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2">
								<p className="text-sm font-medium">{t("runWithoutInstall")}</p>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() =>
											handleCopy("bootstrap-command", runWithoutInstallCommand)
										}
									>
										{copyFeedback?.target === "bootstrap-command" &&
										copyFeedback.status === "success" ? (
											<Check className="h-4 w-4" />
										) : (
											<Copy className="h-4 w-4" />
										)}
										{t("copy")}
									</Button>
								</div>
								<pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
									<code>{runWithoutInstallCommand}</code>
								</pre>
								<p
									className={cn(
										"text-xs",
										copyFeedback?.target === "bootstrap-command" &&
											copyFeedback.status === "error"
											? "text-red-600 dark:text-red-400"
											: "text-zinc-500 dark:text-zinc-400",
									)}
								>
									{copyFeedback?.target === "bootstrap-command"
										? copyFeedback.message
										: t("bootstrapDescription")}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Wrench className="h-4 w-4" />
								{t("prerequisites")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
								<li>{t("prerequisiteCloudCliAuth")}</li>
								<li>{t("prerequisiteIamPermissions")}</li>
								<li>{t("prerequisiteGatewayApiKey")}</li>
								<li>{t("prerequisiteRegionQuota")}</li>
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<AlertTriangle className="h-4 w-4" />
								{t("troubleshooting")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
								<li>{t("troubleshootPermissions")}</li>
								<li>{t("troubleshootCapacity")}</li>
								<li>{t("troubleshootModelRoute")}</li>
								<li>{t("troubleshootBootstrap")}</li>
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<TerminalSquare className="h-4 w-4" />
								{t("teardown")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
								<li>{t("teardownResources")}</li>
								<li>{t("teardownCredentials")}</li>
								<li>{t("teardownBillingReview")}</li>
								<li>{t("teardownGatewayBilling")}</li>
							</ul>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
