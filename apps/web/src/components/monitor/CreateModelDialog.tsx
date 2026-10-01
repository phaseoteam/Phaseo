"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Loader2 } from "lucide-react";
import { createModel } from "@/app/(dashboard)/internal/audit/actions";
import { fetchOrganisations } from "@/app/(dashboard)/internal/audit/actions-advanced";
import { useRouter } from "next/navigation";

const MODALITY_OPTIONS = [
	{ value: "text", label: "modalities.text" },
	{ value: "image", label: "modalities.image" },
	{ value: "video", label: "modalities.video" },
	{ value: "audio", label: "modalities.audio" },
	{ value: "audio_stt", label: "modalities.audioStt" },
	{ value: "audio_tts", label: "modalities.audioTts" },
	{ value: "audio_music", label: "modalities.audioMusic" },
	{ value: "file", label: "modalities.file" },
	{ value: "embeddings", label: "modalities.embeddings" },
	{ value: "code", label: "modalities.code" },
	{ value: "vision", label: "modalities.vision" },
	{ value: "speech", label: "modalities.speech" },
	{ value: "multimodal", label: "modalities.multimodal" },
] as const;

const STATUS_OPTIONS = [
	{ value: "active", label: "statuses.active" },
	{ value: "beta", label: "statuses.beta" },
	{ value: "deprecated", label: "statuses.deprecated" },
	{ value: "retired", label: "statuses.retired" },
	{ value: "preview", label: "statuses.preview" },
] as const;

export function CreateModelDialog() {
	const tUi = useTranslations("Common.ui");
	const t = useTranslations("Common.ui.modelCreation");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [modelId, setModelId] = useState("");
	const [name, setName] = useState("");
	const [organisationId, setOrganisationId] = useState("");
	const [releaseDate, setReleaseDate] = useState("");
	const [retirementDate, setRetirementDate] = useState("");
	const [status, setStatus] = useState("active");
	const [hidden, setHidden] = useState(false);
	const [inputTypes, setInputTypes] = useState<string[]>(["text"]);
	const [outputTypes, setOutputTypes] = useState<string[]>(["text"]);

	const [organisations, setOrganisations] = useState<
		Array<{ id: string; name: string }>
	>([]);

	// Fetch organisations when dialog opens
	useEffect(() => {
		if (open) {
			fetchOrganisations().then((result) => {
				if (result.success) {
					setOrganisations(result.data);
				}
			});
		}
	}, [open]);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setModelId("");
			setName("");
			setOrganisationId("");
			setReleaseDate("");
			setRetirementDate("");
			setStatus("active");
			setHidden(false);
			setInputTypes(["text"]);
			setOutputTypes(["text"]);
			setError(null);
		}
	}, [open]);

	const handleCreate = () => {
		if (!modelId || !name) {
			setError(t("missingRequired"));
			return;
		}

		setError(null);
		startTransition(async () => {
			const result = await createModel({
				modelId,
				name,
				organisationId: organisationId || null,
				releaseDate: releaseDate || null,
				retirementDate: retirementDate || null,
				status,
				hidden,
				inputTypes,
				outputTypes,
			});

			if (result.success) {
				setOpen(false);
				router.refresh();
			} else {
				setError(t("failedCreate"));
			}
		});
	};

	const toggleInputType = (type: string) => {
		setInputTypes((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
		);
	};

	const toggleOutputType = (type: string) => {
		setOutputTypes((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" />
					{t("title")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
				<DialogHeader>
					<DialogTitle className="text-lg sm:text-xl">{t("dialogTitle")}</DialogTitle>
					<DialogDescription className="text-sm">
						{t("description")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					{/* Model ID */}
					<div className="space-y-2">
						<Label htmlFor="model-id">
							{t("modelId")} * <span className="text-xs text-muted-foreground">({t("uniqueIdentifier")})</span>
						</Label>
						<Input
							id="model-id"
							value={modelId}
							onChange={(e) => setModelId(e.target.value)}
							placeholder={t("modelIdExample")}
						/>
						<p className="text-xs text-muted-foreground">
							{t("modelIdHelp")}
						</p>
					</div>

					{/* Name */}
					<div className="space-y-2">
						<Label htmlFor="name">{t("displayName")} *</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t("displayNameExample")}
						/>
					</div>

					{/* Organization */}
					<div className="space-y-2">
						<Label htmlFor="organisation-select">{t("organization")}</Label>
						<Select
							value={organisationId || "none"}
							onValueChange={(value) =>
								setOrganisationId(value === "none" ? "" : value)
							}
						>
							<SelectTrigger id="organisation-select">
								<SelectValue placeholder={t("selectOrganization")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{tUi("select.none")}</SelectItem>
								{organisations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										{org.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Status */}
					<div className="space-y-2">
						<Label htmlFor="status">{t("status")}</Label>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger id="status">
								<SelectValue placeholder={t("selectStatus")} />
							</SelectTrigger>
							<SelectContent>
								{STATUS_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{t(opt.label)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Hidden */}
					<div className="flex items-center space-x-2">
						<Checkbox
							id="hidden"
							checked={hidden}
							onCheckedChange={(checked) => setHidden(checked === true)}
						/>
						<Label htmlFor="hidden" className="cursor-pointer font-normal text-sm">
							{t("hidden")} <span className="text-muted-foreground">({t("hiddenDescription")})</span>
						</Label>
					</div>

					{/* Release Date */}
					<div className="space-y-2">
						<Label htmlFor="release-date">{t("releaseDate")}</Label>
						<Input
							id="release-date"
							type="date"
							value={releaseDate}
							onChange={(e) => setReleaseDate(e.target.value)}
						/>
					</div>

					{/* Retirement Date */}
					<div className="space-y-2">
						<Label htmlFor="retirement-date">{t("retirementDate")}</Label>
						<Input
							id="retirement-date"
							type="date"
							value={retirementDate}
							onChange={(e) => setRetirementDate(e.target.value)}
						/>
					</div>

					{/* Input Modalities */}
					<div className="space-y-2">
						<Label>{t("inputModalities")}</Label>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((modality) => (
								<Badge
									key={modality.value}
									variant={
										inputTypes.includes(modality.value) ? "default" : "outline"
									}
									className="cursor-pointer text-xs sm:text-sm"
									onClick={() => toggleInputType(modality.value)}
								>
									{t(modality.label)}
									{inputTypes.includes(modality.value) && (
										<X className="ml-1 h-3 w-3" />
									)}
								</Badge>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{t("toggleInputModalities")}
						</p>
					</div>

					{/* Output Modalities */}
					<div className="space-y-2">
						<Label>{t("outputModalities")}</Label>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((modality) => (
								<Badge
									key={modality.value}
									variant={
										outputTypes.includes(modality.value) ? "default" : "outline"
									}
									className="cursor-pointer text-xs sm:text-sm"
									onClick={() => toggleOutputType(modality.value)}
								>
									{t(modality.label)}
									{outputTypes.includes(modality.value) && (
										<X className="ml-1 h-3 w-3" />
									)}
								</Badge>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{t("toggleOutputModalities")}
						</p>
					</div>
				</div>

				<DialogFooter className="flex-col sm:flex-row gap-2">
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
						className="w-full sm:w-auto"
					>
						{t("cancel")}
					</Button>
					<Button
						onClick={handleCreate}
						disabled={isPending || !modelId || !name}
						className="w-full sm:w-auto"
					>
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{t("title")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
