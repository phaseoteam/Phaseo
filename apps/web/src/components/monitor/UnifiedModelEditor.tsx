"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import { updateModel } from "@/app/(dashboard)/internal/audit/actions";
import {
	updateModelDetails,
	updateModelLinks,
	updateModelAliases,
	updateModelOrganization,
	deleteModel,
	fetchOrganisations,
} from "@/app/(dashboard)/internal/audit/actions-advanced";
import { useRouter } from "next/navigation";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnifiedModelEditorProps {
	model: AuditModelData | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const MODALITY_OPTIONS = [
	"text",
	"image",
	"video",
	"audio",
	"audio_stt",
	"audio_tts",
	"audio_music",
	"file",
	"embeddings",
	"code",
	"vision",
	"speech",
	"multimodal",
];

const STATUS_OPTIONS = ["active", "beta", "deprecated", "retired", "preview"];

const LINK_TYPES = [
	"documentation",
	"blog",
	"paper",
	"github",
	"pricing",
	"api",
];

export function UnifiedModelEditor({
	model,
	open,
	onOpenChange,
}: UnifiedModelEditorProps) {
	const tUi = useTranslations("Common.ui");
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Basic form state
	const [name, setName] = useState(model?.modelName || "");
	const [releaseDate, setReleaseDate] = useState(
		model?.releaseDate?.split("T")[0] || ""
	);
	const [retirementDate, setRetirementDate] = useState(
		model?.retirementDate?.split("T")[0] || ""
	);
	const [status, setStatus] = useState(model?.status || "active");
	const [hidden, setHidden] = useState(model?.hidden || false);
	const [inputTypes, setInputTypes] = useState<string[]>(
		model?.inputTypes || []
	);
	const [outputTypes, setOutputTypes] = useState<string[]>(
		model?.outputTypes || []
	);

	// Advanced state
	const [details, setDetails] = useState<Array<{ name: string; value: string }>>(
		[]
	);
	const [links, setLinks] = useState<Array<{ type: string; url: string }>>([]);
	const [aliases, setAliases] = useState<
		Array<{ alias: string; enabled: boolean }>
	>([]);
	const [selectedOrg, setSelectedOrg] = useState(model?.organisationId || "");
	const [organisations, setOrganisations] = useState<
		Array<{ id: string; name: string }>
	>([]);

	// Update state when model changes
	useEffect(() => {
		if (model) {
			setName(model.modelName);
			setReleaseDate(model.releaseDate?.split("T")[0] || "");
			setRetirementDate(model.retirementDate?.split("T")[0] || "");
			setStatus(model.status || "active");
			setHidden(model.hidden);
			setInputTypes(model.inputTypes || []);
			setOutputTypes(model.outputTypes || []);
			setSelectedOrg(model.organisationId || "");
			setError(null);

			// Reset advanced fields when model changes
			setDetails([]);
			setLinks([]);
			setAliases([]);
		}
	}, [model]);

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

	const handleSaveBasic = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModel({
				modelId: model.modelId,
				name,
				releaseDate: releaseDate || null,
				retirementDate: retirementDate || null,
				status: status || null,
				hidden,
				inputTypes,
				outputTypes,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.updateModel"));
			}
		});
	};

	const handleSaveDetails = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModelDetails({
				modelId: model.modelId,
				details,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.updateDetails"));
			}
		});
	};

	const handleSaveLinks = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModelLinks({
				modelId: model.modelId,
				links,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.updateLinks"));
			}
		});
	};

	const handleSaveAliases = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModelAliases({
				modelId: model.modelId,
				aliases,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.updateAliases"));
			}
		});
	};

	const handleSaveOrganization = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModelOrganization({
				modelId: model.modelId,
				organisationId: selectedOrg || null,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.updateOrganization"));
			}
		});
	};

	const handleDeleteModel = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await deleteModel(model.modelId);

			if (result.success) {
				setShowDeleteConfirm(false);
				onOpenChange(false);
				router.refresh();
			} else {
				setError(result.error || tUi("modelEditor.advanced.errors.deleteModel"));
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

	if (!model) return null;

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
					<DialogHeader>
						<DialogTitle className="text-lg sm:text-xl">{tUi("modelEditor.advanced.editModel", { modelName: model.modelName })}</DialogTitle>
						<DialogDescription className="text-sm">
							{tUi("modelEditor.advanced.description", { modelName: model.modelName })}
						</DialogDescription>
					</DialogHeader>

					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					<Tabs defaultValue="basic" className="w-full">
						<TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 gap-1">
							<TabsTrigger value="basic" className="text-xs sm:text-sm">{tUi("editorTabs.basic")}</TabsTrigger>
							<TabsTrigger value="details" className="text-xs sm:text-sm">{tUi("editorTabs.details")}</TabsTrigger>
							<TabsTrigger value="links" className="text-xs sm:text-sm">{tUi("editorTabs.links")}</TabsTrigger>
							<TabsTrigger value="aliases" className="text-xs sm:text-sm">{tUi("editorTabs.aliases")}</TabsTrigger>
							<TabsTrigger value="organization" className="text-xs sm:text-sm">{tUi("editorTabs.organization")}</TabsTrigger>
							<TabsTrigger value="danger" className="text-xs sm:text-sm">⚠️</TabsTrigger>
						</TabsList>

						{/* BASIC INFO */}
						<TabsContent value="basic" className="space-y-4">
							{/* Model ID (read-only) */}
							<div className="space-y-2">
								<Label htmlFor="model-id">{tUi("modelEditor.publicModelId")}</Label>
								<Input
									id="model-id"
									value={model.modelId}
									disabled
									className="bg-muted"
								/>
								<p className="text-xs text-muted-foreground">
									{tUi("modelEditor.advanced.modelIdReadOnly")}
								</p>
							</div>

							{/* Name */}
							<div className="space-y-2">
								<Label htmlFor="name">{tUi("modelCreation.displayName")} *</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={tUi("modelCreation.displayNameExample")}
								/>
							</div>

							{/* Status */}
							<div className="space-y-2">
								<Label htmlFor="status">{tUi("modelCreation.status")}</Label>
								<Select value={status || "active"} onValueChange={setStatus}>
									<SelectTrigger id="status">
										<SelectValue placeholder={tUi("modelCreation.selectStatus")} />
									</SelectTrigger>
									<SelectContent>
										{STATUS_OPTIONS.map((opt) => (
											<SelectItem key={opt} value={opt}>
												{tUi(`modelCreation.statuses.${opt}` as never)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Hidden */}
							<div className="flex items-start space-x-2">
								<Checkbox
									id="hidden"
									checked={hidden}
									onCheckedChange={(checked) => setHidden(checked === true)}
								/>
								<div className="space-y-1">
									<Label htmlFor="hidden" className="cursor-pointer font-normal">
										{tUi("modelEditor.advanced.hidden")}
									</Label>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.hiddenDescription")}
									</p>
								</div>
							</div>

							{/* Release Date */}
							<div className="space-y-2">
								<Label htmlFor="release-date">{tUi("modelCreation.releaseDate")}</Label>
								<Input
									id="release-date"
									type="date"
									value={releaseDate}
									onChange={(e) => setReleaseDate(e.target.value)}
								/>
							</div>

							{/* Retirement Date */}
							<div className="space-y-2">
								<Label htmlFor="retirement-date">{tUi("modelCreation.retirementDate")}</Label>
								<Input
									id="retirement-date"
									type="date"
									value={retirementDate}
									onChange={(e) => setRetirementDate(e.target.value)}
								/>
							</div>

							{/* Input Modalities */}
							<div className="space-y-2">
								<Label>{tUi("modelEditor.inputTypes")}</Label>
								<div className="flex flex-wrap gap-2">
									{MODALITY_OPTIONS.map((modality) => (
										<Badge
											key={modality}
											variant={
												inputTypes.includes(modality) ? "default" : "outline"
											}
											className="cursor-pointer"
											onClick={() => toggleInputType(modality)}
										>
											{modality}
											{inputTypes.includes(modality) && (
												<X className="ml-1 h-3 w-3" />
											)}
										</Badge>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
									{tUi("modelEditor.advanced.toggleInputTypes")}
								</p>
							</div>

							{/* Output Modalities */}
							<div className="space-y-2">
								<Label>{tUi("modelEditor.outputTypes")}</Label>
								<div className="flex flex-wrap gap-2">
									{MODALITY_OPTIONS.map((modality) => (
										<Badge
											key={modality}
											variant={
												outputTypes.includes(modality) ? "default" : "outline"
											}
											className="cursor-pointer"
											onClick={() => toggleOutputType(modality)}
										>
											{modality}
											{outputTypes.includes(modality) && (
												<X className="ml-1 h-3 w-3" />
											)}
										</Badge>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
									{tUi("modelEditor.advanced.toggleOutputTypes")}
								</p>
							</div>

							<Button onClick={handleSaveBasic} disabled={isPending || !name}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("actions.save")}
							</Button>
						</TabsContent>

						{/* DETAILS */}
						<TabsContent value="details" className="space-y-4">
							<p className="text-sm text-muted-foreground">
								{tUi("modelEditor.advanced.detailsHelp")}
							</p>

							{details.map((detail, idx) => (
								<div key={idx} className="flex gap-2">
									<Input
										placeholder={tUi("modelEditor.advanced.detailName")}
										value={detail.name}
										onChange={(e) => {
											const newDetails = [...details];
											newDetails[idx].name = e.target.value;
											setDetails(newDetails);
										}}
									/>
									<Input
										placeholder={tUi("modelEditor.advanced.detailValue")}
										value={detail.value}
										onChange={(e) => {
											const newDetails = [...details];
											newDetails[idx].value = e.target.value;
											setDetails(newDetails);
										}}
									/>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => {
											setDetails(details.filter((_, i) => i !== idx));
										}}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}

							<Button
								variant="outline"
								size="sm"
								onClick={() => setDetails([...details, { name: "", value: "" }])}
							>
								<Plus className="h-4 w-4 mr-2" />
								{tUi("modelEditor.advanced.addDetail")}
							</Button>

							<Button onClick={handleSaveDetails} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("modelEditor.advanced.saveDetails")}
							</Button>
						</TabsContent>

						{/* LINKS */}
						<TabsContent value="links" className="space-y-4">
							<p className="text-sm text-muted-foreground">
								{tUi("modelEditor.advanced.linksHelp")}
							</p>

							{links.map((link, idx) => (
								<div key={idx} className="flex gap-2">
									<Select
										value={link.type || "documentation"}
										onValueChange={(value) => {
											const newLinks = [...links];
											newLinks[idx].type = value;
											setLinks(newLinks);
										}}
									>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder={tUi("modelEditor.advanced.linkType")} />
										</SelectTrigger>
										<SelectContent>
											{LINK_TYPES.map((type) => (
												<SelectItem key={type} value={type}>
													{tUi(`modelEditor.advanced.linkTypeOptions.${type}` as never)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
										placeholder="URL"
										value={link.url}
										onChange={(e) => {
											const newLinks = [...links];
											newLinks[idx].url = e.target.value;
											setLinks(newLinks);
										}}
									/>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => {
											setLinks(links.filter((_, i) => i !== idx));
										}}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}

							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setLinks([...links, { type: "documentation", url: "" }])
								}
							>
								<Plus className="h-4 w-4 mr-2" />
								{tUi("modelEditor.advanced.addLink")}
							</Button>

							<Button onClick={handleSaveLinks} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("modelEditor.advanced.saveLinks")}
							</Button>
						</TabsContent>

						{/* ALIASES */}
						<TabsContent value="aliases" className="space-y-4">
							<p className="text-sm text-muted-foreground">
								{tUi("modelEditor.advanced.aliasesHelp")}
							</p>

							{aliases.map((alias, idx) => (
								<div key={idx} className="flex gap-2 items-center">
									<Input
										placeholder={tUi("modelEditor.advanced.aliasName")}
										value={alias.alias}
										onChange={(e) => {
											const newAliases = [...aliases];
											newAliases[idx].alias = e.target.value;
											setAliases(newAliases);
										}}
									/>
									<div className="flex items-center space-x-2">
										<Checkbox
											id={`enabled-${idx}`}
											checked={alias.enabled}
											onCheckedChange={(checked) => {
												const newAliases = [...aliases];
												newAliases[idx].enabled = checked === true;
												setAliases(newAliases);
											}}
										/>
										<Label
											htmlFor={`enabled-${idx}`}
											className="cursor-pointer font-normal whitespace-nowrap"
										>
											{tUi("modelEditor.advanced.enabled")}
										</Label>
									</div>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => {
											setAliases(aliases.filter((_, i) => i !== idx));
										}}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}

							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setAliases([...aliases, { alias: "", enabled: true }])
								}
							>
								<Plus className="h-4 w-4 mr-2" />
								{tUi("modelEditor.advanced.addAlias")}
							</Button>

							<Button onClick={handleSaveAliases} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("modelEditor.advanced.saveAliases")}
							</Button>
						</TabsContent>

						{/* ORGANIZATION */}
						<TabsContent value="organization" className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="organisation-select">{tUi("modelEditor.advanced.organization")}</Label>
								<Select value={selectedOrg || "none"} onValueChange={(value) => setSelectedOrg(value === "none" ? "" : value)}>
									<SelectTrigger id="organisation-select">
										<SelectValue placeholder={tUi("modelEditor.advanced.selectOrganization")} />
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
								<p className="text-xs text-muted-foreground">
									{tUi("modelEditor.advanced.currentOrganization", { organization: model.organisationName || tUi("select.none") })}
								</p>
							</div>

							<Button onClick={handleSaveOrganization} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("modelEditor.advanced.updateOrganization")}
							</Button>
						</TabsContent>

						{/* DANGER ZONE */}
						<TabsContent value="danger" className="space-y-4">
							<div className="border border-red-200 rounded-lg p-4 bg-red-50">
								<h3 className="text-lg font-semibold text-red-900 mb-2">
									{tUi("modelEditor.advanced.dangerZone")}
								</h3>
								<p className="text-sm text-red-800 mb-4">
									{tUi("modelEditor.advanced.dangerZoneDescription")}
								</p>

								<Button
									variant="destructive"
									onClick={() => setShowDeleteConfirm(true)}
									disabled={isPending}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									{tUi("modelEditor.advanced.deleteModel")}
								</Button>
							</div>
						</TabsContent>
					</Tabs>
				</DialogContent>
			</Dialog>

			<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{tUi("modelEditor.advanced.deleteConfirmationTitle")}</AlertDialogTitle>
						<AlertDialogDescription>{tUi("modelEditor.advanced.deleteConfirmationDescription", { modelName: model.modelName })}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{tUi("modelEditor.advanced.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteModel}
							className="bg-red-600 hover:bg-red-700"
						>
							{tUi("modelEditor.advanced.deletePermanently")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
