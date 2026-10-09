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
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Trash2, Loader2, ExternalLink, Edit } from "lucide-react";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import { updateModel } from "@/app/(dashboard)/internal/audit/actions";
import {
	updateModelDetails,
	updateModelLinks,
	updateModelAliases,
	updateModelOrganization,
	deleteModel,
	fetchOrganisations,
	createProviderModel,
	updateProviderModel,
	deleteProviderModel,
	createBenchmarkResult,
	updateBenchmarkResult,
	deleteBenchmarkResult,
	fetchProviders,
	fetchBenchmarks,
	fetchCompleteModelData,
	type CompleteModelData,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import Link from "next/link";

interface ComprehensiveModelEditorProps {
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
];

const STATUS_OPTIONS = [
	"Rumoured",
	"Announced",
	"Limited Access",
	"Withheld",
	"Available",
	"Deprecated",
	"Retired",
];

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
	Rumoured: "rumoured",
	Announced: "announced",
	"Limited Access": "limitedAccess",
	Withheld: "withheld",
	Available: "available",
	Deprecated: "deprecated",
	Retired: "retired",
};

const MODALITY_TRANSLATION_KEYS: Record<string, string> = {
	text: "text",
	image: "image",
	video: "video",
	audio: "audio",
	audio_stt: "audioStt",
	audio_tts: "audioTts",
	audio_music: "audioMusic",
};

const DETAIL_OPTIONS = [
	"input_context_length",
	"knowledge_cutoff",
	"output_context_length",
	"parameter_count",
	"training_tokens",
];

const LINK_TYPES = [
	"documentation",
	"blog",
	"paper",
	"github",
	"pricing",
	"api",
	"announcement",
	"changelog",
];

const LINK_TYPE_TRANSLATION_KEYS: Record<string, string> = {
	documentation: "documentation",
	blog: "blogPost",
	paper: "researchPaper",
	github: "github",
	pricing: "pricingPage",
	api: "apiReference",
	announcement: "announcement",
	changelog: "changelog",
};

export function ComprehensiveModelEditor({
	model,
	open,
	onOpenChange,
}: ComprehensiveModelEditorProps) {
	const tUi = useTranslations("Common.ui");
	const modalityLabel = (modality: string) => {
		const key = MODALITY_TRANSLATION_KEYS[modality];
		return key ? tUi(`modelCreation.modalities.${key}` as never) : modality;
	};
	const statusLabel = (status: string) => {
		const key = STATUS_TRANSLATION_KEYS[status];
		return key ? tUi(`modelEditor.modelStatuses.${key}` as never) : status;
	};
	const linkTypeLabel = (type: string) => {
		const key = LINK_TYPE_TRANSLATION_KEYS[type];
		return key ? tUi(`linkTypes.${key}` as never) : type;
	};
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [loading, setLoading] = useState(false);
	const [completeData, setCompleteData] = useState<CompleteModelData | null>(null);

	// Basic form state (EXPANDED)
	const [name, setName] = useState(model?.modelName || "");
	const [organisationId, setOrganisationId] = useState(
		model?.organisationId || ""
	);
	const [license, setLicense] = useState("");
	const [familyId, setFamilyId] = useState("");
	const [previousModelId, setPreviousModelId] = useState("");
	const [replacementModelId, setReplacementModelId] = useState("");
	const [announcementDate, setAnnouncementDate] = useState("");
	const [releaseDate, setReleaseDate] = useState(
		model?.releaseDate?.split("T")[0] || ""
	);
	const [deprecationDate, setDeprecationDate] = useState("");
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
	const [links, setLinks] = useState<Array<{ type: string; title?: string; url: string }>>([]);
	const [aliases, setAliases] = useState<
		Array<{ alias: string; enabled: boolean }>
	>([]);

	// Reference data
	const [organisations, setOrganisations] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [providers, setProviders] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [benchmarks, setBenchmarks] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [families, setFamilies] = useState<
		Array<{ id: string; name: string }>
	>([]);

	// Provider Model state
	const [newProviderModelForm, setNewProviderModelForm] = useState({
		providerId: "",
		apiModelId: "",
		isActiveGateway: true,
		inputModalities: ["text"],
		outputModalities: ["text"],
	});

	// Benchmark state
	const [newBenchmarkForm, setNewBenchmarkForm] = useState({
		benchmarkId: "",
		score: "",
		isSelfReported: false,
		sourceLink: "",
		otherInfo: "",
	});

	// Edit mode tracking
	const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
	const [editingBenchmarkId, setEditingBenchmarkId] = useState<string | null>(null);

	// Edit forms
	const [editProviderForm, setEditProviderForm] = useState<{
		isActiveGateway: boolean;
		inputModalities: string[];
		outputModalities: string[];
		effectiveFrom: string;
		effectiveTo: string;
	} | null>(null);

	const [editBenchmarkForm, setEditBenchmarkForm] = useState<{
		score: string;
		isSelfReported: boolean;
		sourceLink: string;
		otherInfo: string;
	} | null>(null);

	// Fetch ALL data when dialog opens
	useEffect(() => {
		if (open && model) {
			setLoading(true);
			setError(null);

			// Fetch complete model data
			fetchCompleteModelData(model.modelId).then((result) => {
				if (result.success && result.data) {
					const data = result.data;
					setCompleteData(data);

					// Populate basic fields
					setName(data.name);
					setOrganisationId(data.organisation_id || "");
					setStatus(data.status || "active");
					setHidden(data.hidden);
					setLicense(data.license || "");
					setFamilyId(data.family_id || "");
					setPreviousModelId(data.previous_model_id || "");
					setReplacementModelId(data.replacement_model_id || "");
					setReleaseDate(data.release_date?.split("T")[0] || "");
					setRetirementDate(data.retirement_date?.split("T")[0] || "");
					setAnnouncementDate(data.announcement_date?.split("T")[0] || "");
					setDeprecationDate(data.deprecation_date?.split("T")[0] || "");
					setInputTypes(data.input_types || []);
					setOutputTypes(data.output_types || []);

					// Populate details (existing data)
					setDetails(
						data.details.map((d) => ({
							name: d.detail_name,
							value: d.detail_value,
						}))
					);

					// Populate links (existing data)
					setLinks(
						data.links.map((l) => ({
							type: l.kind ?? l.platform,
							title: l.title,
							url: l.url,
						}))
					);

					// Populate aliases (existing data)
					setAliases(
						data.aliases.map((a) => ({
							alias: a.alias_slug,
							enabled: a.is_enabled,
						}))
					);
				} else {
					setError(tUi("modelEditor.advanced.errors.loadModel"));
				}
				setLoading(false);
			});

			// Fetch reference data in parallel
			Promise.all([
				fetchOrganisations(),
				fetchProviders(),
				fetchBenchmarks(),
			]).then(([orgsResult, providersResult, benchmarksResult]) => {
				if (orgsResult.success) setOrganisations(orgsResult.data);
				if (providersResult.success) setProviders(providersResult.data);
				if (benchmarksResult.success) setBenchmarks(benchmarksResult.data);
			});
		}
	}, [open, model]);

	const handleSaveBasic = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModel({
				modelId: model.modelId,
				name,
				organisationId: organisationId || null,
				releaseDate: releaseDate || null,
				retirementDate: retirementDate || null,
				announcementDate: announcementDate || null,
				deprecationDate: deprecationDate || null,
				status: status || null,
				hidden,
				license: license || null,
				familyId: familyId || null,
				previousModelId: previousModelId || null,
				replacementModelId: replacementModelId || null,
				inputTypes,
				outputTypes,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.updateModel"));
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
				setError(tUi("modelEditor.advanced.errors.updateDetails"));
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
				setError(tUi("modelEditor.advanced.errors.updateLinks"));
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
				setError(tUi("modelEditor.advanced.errors.updateAliases"));
			}
		});
	};

	const handleSaveOrganization = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModelOrganization({
				modelId: model.modelId,
				organisationId: organisationId || null,
			});

			if (result.success) {
				router.refresh();
				setError(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.updateOrganization"));
			}
		});
	};

	const handleAddProviderModel = () => {
		if (!model || !newProviderModelForm.providerId || !newProviderModelForm.apiModelId) {
			setError(tUi("modelEditor.advanced.errors.providerRequired"));
			return;
		}

		setError(null);
		startTransition(async () => {
			const result = await createProviderModel({
				providerId: newProviderModelForm.providerId,
				apiModelId: newProviderModelForm.apiModelId,
				internalModelId: model.modelId,
				isActiveGateway: newProviderModelForm.isActiveGateway,
				inputModalities: newProviderModelForm.inputModalities,
				outputModalities: newProviderModelForm.outputModalities,
			});

			if (result.success) {
				router.refresh();
				setNewProviderModelForm({
					providerId: "",
					apiModelId: "",
					isActiveGateway: true,
					inputModalities: ["text"],
					outputModalities: ["text"],
				});
				setError(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.addProvider"));
			}
		});
	};

	const handleAddBenchmark = () => {
		if (!model || !newBenchmarkForm.benchmarkId || !newBenchmarkForm.score) {
			setError(tUi("modelEditor.advanced.errors.benchmarkRequired"));
			return;
		}

		setError(null);
		startTransition(async () => {
			const result = await createBenchmarkResult({
				modelId: model.modelId,
				benchmarkId: newBenchmarkForm.benchmarkId,
				score: newBenchmarkForm.score,
				isSelfReported: newBenchmarkForm.isSelfReported,
				sourceLink: newBenchmarkForm.sourceLink || undefined,
				otherInfo: newBenchmarkForm.otherInfo || undefined,
			});

			if (result.success) {
				router.refresh();
				setNewBenchmarkForm({
					benchmarkId: "",
					score: "",
					isSelfReported: false,
					sourceLink: "",
					otherInfo: "",
				});
				setError(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.addBenchmark"));
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
				setError(tUi("modelEditor.advanced.errors.deleteModel"));
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

	const toggleProviderInputModality = (modality: string) => {
		setNewProviderModelForm((prev) => ({
			...prev,
			inputModalities: prev.inputModalities.includes(modality)
				? prev.inputModalities.filter((m) => m !== modality)
				: [...prev.inputModalities, modality],
		}));
	};

	const toggleProviderOutputModality = (modality: string) => {
		setNewProviderModelForm((prev) => ({
			...prev,
			outputModalities: prev.outputModalities.includes(modality)
				? prev.outputModalities.filter((m) => m !== modality)
				: [...prev.outputModalities, modality],
		}));
	};

	const toggleEditProviderInputModality = (modality: string) => {
		if (!editProviderForm) return;
		setEditProviderForm({
			...editProviderForm,
			inputModalities: editProviderForm.inputModalities.includes(modality)
				? editProviderForm.inputModalities.filter((m) => m !== modality)
				: [...editProviderForm.inputModalities, modality],
		});
	};

	const toggleEditProviderOutputModality = (modality: string) => {
		if (!editProviderForm) return;
		setEditProviderForm({
			...editProviderForm,
			outputModalities: editProviderForm.outputModalities.includes(modality)
				? editProviderForm.outputModalities.filter((m) => m !== modality)
				: [...editProviderForm.outputModalities, modality],
		});
	};

	const handleEditProvider = (pm: any) => {
		setEditingProviderId(pm.provider_api_model_id);
		setEditProviderForm({
			isActiveGateway: pm.is_active_gateway,
			inputModalities: pm.input_modalities,
			outputModalities: pm.output_modalities,
			effectiveFrom: pm.effective_from?.split("T")[0] || "",
			effectiveTo: pm.effective_to?.split("T")[0] || "",
		});
	};

	const handleSaveProvider = (providerApiModelId: string) => {
		if (!editProviderForm || !model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateProviderModel({
				providerApiModelId,
				isActiveGateway: editProviderForm.isActiveGateway,
				inputModalities: editProviderForm.inputModalities,
				outputModalities: editProviderForm.outputModalities,
				effectiveFrom: editProviderForm.effectiveFrom || undefined,
				effectiveTo: editProviderForm.effectiveTo || undefined,
			});

			if (result.success) {
				router.refresh();
				// Reload data
				const refreshResult = await fetchCompleteModelData(model.modelId);
				if (refreshResult.success && refreshResult.data) {
					setCompleteData(refreshResult.data);
				}
				setEditingProviderId(null);
				setEditProviderForm(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.updateProvider"));
			}
		});
	};

	const handleEditBenchmark = (benchmark: any) => {
		setEditingBenchmarkId(benchmark.id);
		setEditBenchmarkForm({
			score: benchmark.score,
			isSelfReported: benchmark.is_self_reported,
			sourceLink: benchmark.source_link || "",
			otherInfo: benchmark.other_info || "",
		});
	};

	const handleSaveBenchmark = (benchmarkId: string) => {
		if (!editBenchmarkForm || !model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateBenchmarkResult({
				resultId: benchmarkId,
				score: editBenchmarkForm.score,
				isSelfReported: editBenchmarkForm.isSelfReported,
				sourceLink: editBenchmarkForm.sourceLink || undefined,
				otherInfo: editBenchmarkForm.otherInfo || undefined,
			});

			if (result.success) {
				router.refresh();
				// Reload data
				const refreshResult = await fetchCompleteModelData(model.modelId);
				if (refreshResult.success && refreshResult.data) {
					setCompleteData(refreshResult.data);
				}
				setEditingBenchmarkId(null);
				setEditBenchmarkForm(null);
			} else {
				setError(tUi("modelEditor.advanced.errors.updateBenchmark"));
			}
		});
	};

	if (!model) return null;

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
					<DialogHeader>
						<DialogTitle className="text-lg sm:text-xl">
							{tUi("modelEditor.advanced.editModel", {
								modelName: model.modelName,
							})}
						</DialogTitle>
						<DialogDescription className="text-sm">
							{tUi("modelEditor.advanced.description", {
								modelName: model.modelName,
							})}
						</DialogDescription>
					</DialogHeader>

					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					{loading && (
						<div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 text-sm flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
										{tUi("auditDataTable.loading")}
						</div>
					)}

					<Tabs defaultValue="basic" className="w-full">
						<TabsList className="grid w-full grid-cols-4 sm:grid-cols-9 gap-1 h-auto flex-wrap">
							<TabsTrigger value="basic" className="text-xs sm:text-sm">{tUi("editorTabs.basic")}</TabsTrigger>
							<TabsTrigger value="dates" className="text-xs sm:text-sm">{tUi("editorTabs.dates")}</TabsTrigger>
							<TabsTrigger value="modalities" className="text-xs sm:text-sm">
								{tUi("modelEditor.modalities")}
							</TabsTrigger>
							<TabsTrigger value="details" className="text-xs sm:text-sm">{tUi("editorTabs.details")}</TabsTrigger>
							<TabsTrigger value="links" className="text-xs sm:text-sm">{tUi("editorTabs.links")}</TabsTrigger>
							<TabsTrigger value="aliases" className="text-xs sm:text-sm">{tUi("editorTabs.aliases")}</TabsTrigger>
							<TabsTrigger value="providers" className="text-xs sm:text-sm">{tUi("editorTabs.providers")}</TabsTrigger>
							<TabsTrigger value="benchmarks" className="text-xs sm:text-sm">{tUi("editorTabs.benchmarks")}</TabsTrigger>
							<TabsTrigger value="danger" className="text-xs sm:text-sm">
								⚠️
							</TabsTrigger>
						</TabsList>

						{/* BASIC INFO */}
						<TabsContent value="basic" className="space-y-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{/* Model ID (read-only) */}
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="model-id">{tUi("modelCreation.modelId")}</Label>
									<Input
										id="model-id"
										value={model.modelId}
										disabled
										className="bg-muted font-mono text-sm"
									/>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.modelIdReadOnly")}
									</p>
								</div>

								{/* Name */}
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="name">
										{tUi("modelCreation.displayName")} *
									</Label>
									<Input
										id="name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder={tUi("modelCreation.displayNameExample")}
									/>
								</div>

								{/* Organization */}
								<div className="space-y-2">
									<Label htmlFor="organisation-select">
										{tUi("modelCreation.organization")}
									</Label>
									<Select
										value={organisationId || "none"}
										onValueChange={(value) =>
											setOrganisationId(value === "none" ? "" : value)
										}
									>
										<SelectTrigger id="organisation-select">
											<SelectValue placeholder={tUi("modelCreation.selectOrganization")} />
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
									<Label htmlFor="status">{tUi("modelCreation.status")}</Label>
									<Select value={status || "active"} onValueChange={setStatus}>
										<SelectTrigger id="status">
											<SelectValue placeholder={tUi("modelCreation.selectStatus")} />
										</SelectTrigger>
										<SelectContent>
											{STATUS_OPTIONS.map((opt) => (
												<SelectItem key={opt} value={opt}>
														{statusLabel(opt)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* License */}
								<div className="space-y-2">
									<Label htmlFor="license">{tUi("modelEditor.license")}</Label>
									<Input
										id="license"
										value={license}
										onChange={(e) => setLicense(e.target.value)}
										placeholder={tUi("modelEditor.licenseExample")}
									/>
								</div>

								{/* Previous Model ID */}
								<div className="space-y-2">
									<Label htmlFor="previous-model">{tUi("modelEditor.previousModel")}</Label>
									<Input
										id="previous-model"
										value={previousModelId}
										onChange={(e) => setPreviousModelId(e.target.value)}
										placeholder={tUi("modelEditor.selectPreviousModel")}
									/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="recommended-successor">{tUi("modelEditor.recommendedSuccessor")}</Label>
					<Input
						id="recommended-successor"
						value={replacementModelId}
						onChange={(e) => setReplacementModelId(e.target.value)}
						placeholder={tUi("modelEditor.recommendedSuccessorDescription")}
					/>
					<p className="text-xs text-muted-foreground">
						{tUi("modelEditor.successorNotificationHelp")}
					</p>
				</div>

								{/* Hidden */}
								<div className="space-y-2 sm:col-span-2">
									<div className="flex items-center space-x-2">
										<Checkbox
											id="hidden"
											checked={hidden}
											onCheckedChange={(checked) => setHidden(checked === true)}
										/>
										<Label htmlFor="hidden" className="cursor-pointer font-normal">
											{tUi("modelCreation.hidden")}
										</Label>
									</div>
									<p className="pl-6 text-xs text-muted-foreground">
										{tUi("modelCreation.hiddenDescription")}
									</p>
								</div>
							</div>

							<Button onClick={handleSaveBasic} disabled={isPending || !name}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										{tUi("actions.save")}
							</Button>
						</TabsContent>

						{/* DATES */}
						<TabsContent value="dates" className="space-y-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
										<Label htmlFor="announcement-date">
											{tUi("modelEditor.announcementDate")}
										</Label>
									<Input
										id="announcement-date"
										type="date"
										value={announcementDate}
										onChange={(e) => setAnnouncementDate(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.dates.announcement")}
									</p>
								</div>

								<div className="space-y-2">
										<Label htmlFor="release-date">
											{tUi("modelCreation.releaseDate")}
										</Label>
									<Input
										id="release-date"
										type="date"
										value={releaseDate}
										onChange={(e) => setReleaseDate(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.dates.release")}
									</p>
								</div>

								<div className="space-y-2">
										<Label htmlFor="deprecation-date">
											{tUi("modelEditor.deprecationDate")}
										</Label>
									<Input
										id="deprecation-date"
										type="date"
										value={deprecationDate}
										onChange={(e) => setDeprecationDate(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.dates.deprecation")}
									</p>
								</div>

								<div className="space-y-2">
										<Label htmlFor="retirement-date">
											{tUi("modelCreation.retirementDate")}
										</Label>
									<Input
										id="retirement-date"
										type="date"
										value={retirementDate}
										onChange={(e) => setRetirementDate(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										{tUi("modelEditor.advanced.dates.retirement")}
									</p>
								</div>
							</div>

							<Button onClick={handleSaveBasic} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{tUi("actions.save")}
							</Button>
						</TabsContent>

						{/* MODALITIES */}
						<TabsContent value="modalities" className="space-y-4">
							{/* Input Modalities */}
							<div className="space-y-2">
				<Label>{tUi("modelCreation.inputModalities")}</Label>
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
							{modalityLabel(modality)}
											{inputTypes.includes(modality) && (
												<X className="ml-1 h-3 w-3" />
											)}
										</Badge>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
					{tUi("modelCreation.toggleInputModalities")}
								</p>
							</div>

							{/* Output Modalities */}
							<div className="space-y-2">
				<Label>{tUi("modelCreation.outputModalities")}</Label>
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
							{modalityLabel(modality)}
											{outputTypes.includes(modality) && (
												<X className="ml-1 h-3 w-3" />
											)}
										</Badge>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
					{tUi("modelCreation.toggleOutputModalities")}
								</p>
							</div>

							<Button onClick={handleSaveBasic} disabled={isPending}>
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
									<Select
										value={detail.name}
										onValueChange={(value) => {
											const newDetails = [...details];
											newDetails[idx].name = value;
											setDetails(newDetails);
										}}
									>
										<SelectTrigger>
										<SelectValue placeholder={tUi("select.detailType")} />
										</SelectTrigger>
										<SelectContent>
											{DETAIL_OPTIONS.map((opt) => (
												<SelectItem key={opt} value={opt}>
													{opt}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
										placeholder={detail.name === "knowledge_cutoff" ? "YYYY-MM-DD" : tUi("versionedPricing.value")}
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
											aria-label={tUi("actions.remove")}
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
									{linkTypeLabel(type)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
									placeholder={tUi("modelEditor.advanced.url")}
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
										aria-label={tUi("actions.remove")}
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
										aria-label={tUi("actions.remove")}
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

						{/* PROVIDER MODELS */}
						<TabsContent value="providers" className="space-y-4">
							{loading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin" />
								</div>
							) : (
								<>
									<div>
										<h3 className="text-sm font-semibold mb-2">
											{tUi("modelEditor.advanced.providerOfferings", {
												count: completeData?.provider_models.length || 0,
											})}
										</h3>
										<div className="border rounded-md overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow>
									<TableHead>{tUi("versionedPricing.provider")}</TableHead>
									<TableHead>{tUi("apiModelConflicts.apiModelId")}</TableHead>
									<TableHead>{tUi("status.active")}</TableHead>
									<TableHead>{tUi("select.input")}</TableHead>
									<TableHead>{tUi("select.output")}</TableHead>
									<TableHead className="text-right">
										{tUi("auditDataTable.actions")}
									</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{!completeData?.provider_models || completeData.provider_models.length === 0 ? (
														<TableRow>
															<TableCell colSpan={6} className="text-center text-muted-foreground">
											{tUi("modelEditor.advanced.noProviderOfferings")}
															</TableCell>
														</TableRow>
													) : (
														completeData.provider_models.map((pm) => {
															const isEditing = editingProviderId === pm.provider_api_model_id;

															if (isEditing && editProviderForm) {
																return (
																	<TableRow key={pm.provider_api_model_id} className="bg-blue-50">
																		<TableCell className="font-medium text-xs">
																			{pm.provider_id}
																		</TableCell>
																		<TableCell className="font-mono text-xs">
																			{pm.api_model_id}
																		</TableCell>
																		<TableCell>
																			<Checkbox
																				checked={editProviderForm.isActiveGateway}
																				onCheckedChange={(checked) =>
																					setEditProviderForm({
																						...editProviderForm,
																						isActiveGateway: checked === true,
																					})
																				}
																			/>
																		</TableCell>
																		<TableCell>
																			<div className="flex flex-wrap gap-1 max-w-[200px]">
																				{MODALITY_OPTIONS.map((mod) => (
																					<Badge
																						key={mod}
																						variant={
																							editProviderForm.inputModalities.includes(mod)
																								? "default"
																								: "outline"
																						}
																						className="cursor-pointer text-xs"
																						onClick={() => toggleEditProviderInputModality(mod)}
																					>
													{modalityLabel(mod)}
																					</Badge>
																				))}
																			</div>
																		</TableCell>
																		<TableCell>
																			<div className="flex flex-wrap gap-1 max-w-[200px]">
																				{MODALITY_OPTIONS.map((mod) => (
																					<Badge
																						key={mod}
																						variant={
																							editProviderForm.outputModalities.includes(mod)
																								? "default"
																								: "outline"
																						}
																						className="cursor-pointer text-xs"
																						onClick={() => toggleEditProviderOutputModality(mod)}
																					>
													{modalityLabel(mod)}
																					</Badge>
																				))}
																			</div>
																		</TableCell>
																		<TableCell className="text-right">
																			<div className="flex items-center justify-end gap-2">
																				<Button
																					variant="ghost"
																					size="sm"
																					onClick={() => handleSaveProvider(pm.provider_api_model_id)}
																					disabled={isPending}
																				>
																					{isPending ? (
																						<Loader2 className="h-4 w-4 animate-spin" />
																					) : (
											tUi("actions.save")
																					)}
																				</Button>
																				<Button
																					variant="ghost"
																					size="sm"
																					onClick={() => {
																						setEditingProviderId(null);
																						setEditProviderForm(null);
																					}}
																				>
										{tUi("modelEditor.advanced.cancel")}
																				</Button>
																			</div>
																		</TableCell>
																	</TableRow>
																);
															}

															return (
																<TableRow key={pm.provider_api_model_id}>
																	<TableCell className="font-medium text-xs">
																		{pm.provider_id}
																	</TableCell>
																	<TableCell className="font-mono text-xs">
																		{pm.api_model_id}
																	</TableCell>
																	<TableCell>
																		{pm.is_active_gateway ? (
									<Badge variant="default" className="text-xs">{tUi("status.active")}</Badge>
																		) : (
									<Badge variant="outline" className="text-xs">{tUi("status.inactive")}</Badge>
																		)}
																	</TableCell>
																	<TableCell>
																		<div className="flex flex-wrap gap-1">
																			{pm.input_modalities.slice(0, 2).map((mod) => (
																				<Badge key={mod} variant="secondary" className="text-xs">
											{modalityLabel(mod)}
																				</Badge>
																			))}
																			{pm.input_modalities.length > 2 && (
																				<Badge variant="secondary" className="text-xs">
																					+{pm.input_modalities.length - 2}
																				</Badge>
																			)}
																		</div>
																	</TableCell>
																	<TableCell>
																		<div className="flex flex-wrap gap-1">
																			{pm.output_modalities.slice(0, 2).map((mod) => (
																				<Badge key={mod} variant="secondary" className="text-xs">
											{modalityLabel(mod)}
																				</Badge>
																			))}
																			{pm.output_modalities.length > 2 && (
																				<Badge variant="secondary" className="text-xs">
																					+{pm.output_modalities.length - 2}
																				</Badge>
																			)}
																		</div>
																	</TableCell>
																	<TableCell className="text-right">
																		<div className="flex items-center justify-end gap-1">
												<Button
													variant="ghost"
												size="sm"
												onClick={() => handleEditProvider(pm)}
													aria-label={tUi("actions.edit")}
													disabled={isPending || editingProviderId !== null}
																			>
																				<Edit className="h-4 w-4" />
																			</Button>
													<Link
														href={`/api-providers/${pm.provider_id}`}
														aria-label={tUi("actions.viewProviders")}
																				className="text-blue-600 underline decoration-transparent hover:decoration-current transition-colors duration-200 text-xs flex items-center gap-1 px-2"
																			>
																				<ExternalLink className="h-3 w-3" />
																			</Link>
													<Button
														variant="ghost"
														size="sm"
														aria-label={tUi("actions.delete")}
																				onClick={() => {
																					startTransition(async () => {
																						const result = await deleteProviderModel(pm.provider_api_model_id);
																						if (result.success) {
																							router.refresh();
																							const refreshResult = await fetchCompleteModelData(model.modelId);
																							if (refreshResult.success && refreshResult.data) {
																								setCompleteData(refreshResult.data);
																							}
																						} else {
																	setError(tUi("modelEditor.advanced.errors.deleteProvider"));
																						}
																					});
																				}}
																				disabled={isPending || editingProviderId !== null}
																			>
																				<Trash2 className="h-4 w-4 text-red-600" />
																			</Button>
																		</div>
																	</TableCell>
																</TableRow>
															);
														})
													)}
												</TableBody>
											</Table>
										</div>
									</div>
								</>
							)}

							<div className="border-t pt-4">
										<h3 className="text-sm font-semibold mb-3">
											{tUi("modelEditor.advanced.addProviderOffering")}
										</h3>
								<div className="space-y-3">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<div className="space-y-2">
											<Label>{tUi("versionedPricing.provider")}</Label>
											<Select
												value={newProviderModelForm.providerId}
												onValueChange={(value) =>
													setNewProviderModelForm((prev) => ({
														...prev,
														providerId: value,
													}))
												}
											>
												<SelectTrigger>
												<SelectValue placeholder={tUi("select.provider")} />
												</SelectTrigger>
												<SelectContent>
													{providers.map((p) => (
														<SelectItem key={p.id} value={p.id}>
															{p.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-2">
											<Label>{tUi("apiModelConflicts.apiModelId")}</Label>
											<Input
												placeholder={tUi("modelEditor.providerModelIdPlaceholder")}
												value={newProviderModelForm.apiModelId}
												onChange={(e) =>
													setNewProviderModelForm((prev) => ({
														...prev,
														apiModelId: e.target.value,
													}))
												}
											/>
										</div>
									</div>

									<div className="flex items-center space-x-2">
										<Checkbox
											id="active-gateway"
											checked={newProviderModelForm.isActiveGateway}
											onCheckedChange={(checked) =>
												setNewProviderModelForm((prev) => ({
													...prev,
													isActiveGateway: checked === true,
												}))
											}
										/>
										<Label htmlFor="active-gateway" className="cursor-pointer font-normal">
											{tUi("modelEditor.activeOnGateway")}
										</Label>
									</div>

									<div className="space-y-2">
											<Label>{tUi("modelCreation.inputModalities")}</Label>
										<div className="flex flex-wrap gap-2">
											{MODALITY_OPTIONS.map((modality) => (
												<Badge
													key={modality}
													variant={
														newProviderModelForm.inputModalities.includes(modality)
															? "default"
															: "outline"
													}
													className="cursor-pointer text-xs"
													onClick={() => toggleProviderInputModality(modality)}
												>
												{modalityLabel(modality)}
													{newProviderModelForm.inputModalities.includes(modality) && (
														<X className="ml-1 h-3 w-3" />
													)}
												</Badge>
											))}
										</div>
									</div>

									<div className="space-y-2">
											<Label>{tUi("modelCreation.outputModalities")}</Label>
										<div className="flex flex-wrap gap-2">
											{MODALITY_OPTIONS.map((modality) => (
												<Badge
													key={modality}
													variant={
														newProviderModelForm.outputModalities.includes(modality)
															? "default"
															: "outline"
													}
													className="cursor-pointer text-xs"
													onClick={() => toggleProviderOutputModality(modality)}
												>
												{modalityLabel(modality)}
													{newProviderModelForm.outputModalities.includes(modality) && (
														<X className="ml-1 h-3 w-3" />
													)}
												</Badge>
											))}
										</div>
									</div>

									<Button onClick={handleAddProviderModel} disabled={isPending}>
										{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										{tUi("modelEditor.advanced.addProviderOffering")}
									</Button>
								</div>
							</div>
						</TabsContent>

						{/* BENCHMARKS */}
						<TabsContent value="benchmarks" className="space-y-4">
							{loading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin" />
								</div>
							) : (
								<>
									<div>
										<h3 className="text-sm font-semibold mb-2">
											{tUi("modelEditor.advanced.benchmarks.title", {
												count: completeData?.benchmarks.length || 0,
											})}
										</h3>
										<div className="border rounded-md overflow-x-auto mb-4">
											<Table>
												<TableHeader>
													<TableRow>
									<TableHead>{tUi("benchmarkComparison.benchmark")}</TableHead>
									<TableHead>{tUi("modelEditor.advanced.benchmarks.score")}</TableHead>
									<TableHead>{tUi("benchmarkComparison.selfReported")}</TableHead>
									<TableHead>{tUi("modelEditor.advanced.benchmarks.source")}</TableHead>
									<TableHead className="text-right">
										{tUi("auditDataTable.actions")}
									</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{!completeData?.benchmarks || completeData.benchmarks.length === 0 ? (
														<TableRow>
															<TableCell colSpan={5} className="text-center text-muted-foreground">
											{tUi("modelEditor.advanced.benchmarks.noResults")}
															</TableCell>
														</TableRow>
													) : (
														completeData.benchmarks.map((benchmark) => {
															const isEditing = editingBenchmarkId === benchmark.id;

															if (isEditing && editBenchmarkForm) {
																return (
																	<TableRow key={benchmark.id} className="bg-blue-50">
																		<TableCell className="font-medium text-xs">
																			{benchmark.benchmark_name}
																		</TableCell>
																		<TableCell>
																			<Input
																				value={editBenchmarkForm.score}
																				onChange={(e) =>
																					setEditBenchmarkForm({
																						...editBenchmarkForm,
																						score: e.target.value,
																					})
																				}
																				className="w-24 h-8 text-sm"
										placeholder={tUi("modelEditor.advanced.benchmarks.score")}
																			/>
																		</TableCell>
																		<TableCell>
																			<Checkbox
																				checked={editBenchmarkForm.isSelfReported}
																				onCheckedChange={(checked) =>
																					setEditBenchmarkForm({
																						...editBenchmarkForm,
																						isSelfReported: checked === true,
																					})
																				}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				value={editBenchmarkForm.sourceLink}
																				onChange={(e) =>
																					setEditBenchmarkForm({
																						...editBenchmarkForm,
																						sourceLink: e.target.value,
																					})
																				}
																				className="w-32 h-8 text-xs"
																				placeholder="https://..."
																			/>
																		</TableCell>
																		<TableCell className="text-right">
																			<div className="flex items-center justify-end gap-2">
																				<Button
																					variant="ghost"
																					size="sm"
																					onClick={() => handleSaveBenchmark(benchmark.id)}
																					disabled={isPending}
																				>
																					{isPending ? (
																						<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												tUi("actions.save")
											)}
																				</Button>
																				<Button
																					variant="ghost"
																					size="sm"
																					onClick={() => {
																						setEditingBenchmarkId(null);
																						setEditBenchmarkForm(null);
																					}}
																				>
														{tUi("modelEditor.advanced.cancel")}
																				</Button>
																			</div>
																		</TableCell>
																	</TableRow>
																);
															}

															return (
																<TableRow key={benchmark.id}>
																	<TableCell className="font-medium text-xs">
																		{benchmark.benchmark_name}
																	</TableCell>
																	<TableCell className="font-semibold text-sm">
																		{benchmark.score}
																	</TableCell>
																	<TableCell>
																		{benchmark.is_self_reported ? (
										<Badge variant="secondary" className="text-xs">
											{tUi("benchmarkComparison.selfReported")}
										</Badge>
																		) : (
										<Badge variant="outline" className="text-xs">
											{tUi("versionedPricing.external")}
										</Badge>
																		)}
																	</TableCell>
																	<TableCell>
																		{benchmark.source_link ? (
																			<a
																				href={benchmark.source_link}
																				target="_blank"
																				rel="noopener noreferrer"
																				className="text-blue-600 underline decoration-transparent hover:decoration-current transition-colors duration-200 text-xs flex items-center gap-1"
																			>
									{tUi("modelEditor.advanced.benchmarks.sourceLink")} <ExternalLink className="h-3 w-3" />
																			</a>
																		) : (
																			<span className="text-muted-foreground text-xs">-</span>
																		)}
																	</TableCell>
																	<TableCell className="text-right">
																		<div className="flex items-center justify-end gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleEditBenchmark(benchmark)}
													aria-label={tUi("actions.edit")}
																				disabled={isPending || editingBenchmarkId !== null}
																			>
																				<Edit className="h-4 w-4" />
																			</Button>
											<Button
												variant="ghost"
												size="sm"
												aria-label={tUi("actions.delete")}
																				onClick={() => {
																					startTransition(async () => {
																						const result = await deleteBenchmarkResult(benchmark.id);
																						if (result.success) {
																							router.refresh();
																							const refreshResult = await fetchCompleteModelData(model.modelId);
																							if (refreshResult.success && refreshResult.data) {
																								setCompleteData(refreshResult.data);
																							}
																						} else {
											setError(tUi("modelEditor.advanced.errors.deleteBenchmark"));
																						}
																					});
																				}}
																				disabled={isPending || editingBenchmarkId !== null}
																			>
																				<Trash2 className="h-4 w-4 text-red-600" />
																			</Button>
																		</div>
																	</TableCell>
																</TableRow>
															);
														})
													)}
												</TableBody>
											</Table>
										</div>
						<p className="text-sm text-muted-foreground">
							<Link
												href={`/models/${model.modelId}#benchmarks`}
												className="text-blue-600 underline decoration-transparent hover:decoration-current transition-colors duration-200"
											>
								{tUi("benchmarkComparison.viewBenchmarkPage")}
											</Link>
										</p>
									</div>
								</>
							)}

							<div className="border-t pt-4">
						<h3 className="text-sm font-semibold mb-3">
							{tUi("modelEditor.advanced.benchmarks.addResult")}
						</h3>
								<div className="space-y-3">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<div className="space-y-2">
										<Label>{tUi("benchmarkComparison.benchmark")}</Label>
											<Select
												value={newBenchmarkForm.benchmarkId}
												onValueChange={(value) =>
													setNewBenchmarkForm((prev) => ({
														...prev,
														benchmarkId: value,
													}))
												}
											>
												<SelectTrigger>
											<SelectValue placeholder={tUi("benchmarkComparison.selectBenchmark")} />
												</SelectTrigger>
												<SelectContent>
													{benchmarks.map((b) => (
														<SelectItem key={b.id} value={b.id}>
															{b.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-2">
										<Label>{tUi("modelEditor.advanced.benchmarks.score")}</Label>
											<Input
											placeholder={tUi("modelEditor.advanced.benchmarks.score")}
												value={newBenchmarkForm.score}
												onChange={(e) =>
													setNewBenchmarkForm((prev) => ({
														...prev,
														score: e.target.value,
													}))
												}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<Label>{tUi("modelEditor.advanced.benchmarks.sourceLink")}</Label>
										<Input
											placeholder="https://..."
											value={newBenchmarkForm.sourceLink}
											onChange={(e) =>
												setNewBenchmarkForm((prev) => ({
													...prev,
													sourceLink: e.target.value,
												}))
											}
										/>
									</div>

									<div className="space-y-2">
										<Label>{tUi("modelEditor.advanced.benchmarks.additionalInfo")}</Label>
										<Textarea
											placeholder={tUi("modelEditor.advanced.benchmarks.additionalInfoPlaceholder")}
											value={newBenchmarkForm.otherInfo}
											onChange={(e) =>
												setNewBenchmarkForm((prev) => ({
													...prev,
													otherInfo: e.target.value,
												}))
											}
											rows={3}
										/>
									</div>

									<div className="flex items-center space-x-2">
										<Checkbox
											id="self-reported"
											checked={newBenchmarkForm.isSelfReported}
											onCheckedChange={(checked) =>
												setNewBenchmarkForm((prev) => ({
													...prev,
													isSelfReported: checked === true,
												}))
											}
										/>
										<Label htmlFor="self-reported" className="cursor-pointer font-normal">
											{tUi("modelEditor.advanced.benchmarks.selfReportedBy")}
										</Label>
									</div>

									<Button onClick={handleAddBenchmark} disabled={isPending}>
										{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{tUi("modelEditor.advanced.benchmarks.addResult")}
									</Button>
								</div>
							</div>
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
						<AlertDialogTitle>
							{tUi("modelEditor.advanced.deleteConfirmationTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tUi("modelEditor.advanced.deleteConfirmationDescription", {
								modelName: model.modelName,
							})}
						</AlertDialogDescription>
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
