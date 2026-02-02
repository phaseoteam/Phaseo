"use client";

import { useState, useTransition, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { Settings, X, Plus, Trash2, Loader2 } from "lucide-react";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import {
	updateModelDetails,
	updateModelLinks,
	updateModelAliases,
	createProviderModel,
	updateProviderModel,
	deleteProviderModel,
	createBenchmarkResult,
	deleteBenchmarkResult,
	deleteModel,
	updateModelOrganization,
	fetchOrganisations,
	fetchProviders,
	fetchBenchmarks,
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

interface AdvancedModelEditorProps {
	model: AuditModelData;
}

export function AdvancedModelEditor({ model }: AdvancedModelEditorProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Fetched data
	const [organisations, setOrganisations] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [providers, setProviders] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [benchmarks, setBenchmarks] = useState<
		Array<{ id: string; name: string }>
	>([]);

	// Model Details state
	const [details, setDetails] = useState<Array<{ name: string; value: string }>>(
		[]
	);

	// Model Links state
	const [links, setLinks] = useState<Array<{ type: string; url: string }>>([]);

	// Model Aliases state
	const [aliases, setAliases] = useState<
		Array<{ alias: string; enabled: boolean }>
	>([]);

	// Organization state
	const [selectedOrg, setSelectedOrg] = useState(
		model.organisationId || ""
	);

	// Fetch reference data when dialog opens
	useEffect(() => {
		if (open) {
			// Fetch organisations
			fetchOrganisations().then((result) => {
				if (result.success) {
					setOrganisations(result.data);
				}
			});

			// Fetch providers
			fetchProviders().then((result) => {
				if (result.success) {
					setProviders(result.data);
				}
			});

			// Fetch benchmarks
			fetchBenchmarks().then((result) => {
				if (result.success) {
					setBenchmarks(result.data);
				}
			});
		}
	}, [open]);

	const handleSaveDetails = () => {
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
				setError(result.error || "Failed to update details");
			}
		});
	};

	const handleSaveLinks = () => {
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
				setError(result.error || "Failed to update links");
			}
		});
	};

	const handleSaveAliases = () => {
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
				setError(result.error || "Failed to update aliases");
			}
		});
	};

	const handleSaveOrganization = () => {
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
				setError(result.error || "Failed to update organization");
			}
		});
	};

	const handleDeleteModel = () => {
		setError(null);
		startTransition(async () => {
			const result = await deleteModel(model.modelId);

			if (result.success) {
				setOpen(false);
				router.refresh();
			} else {
				setError(result.error || "Failed to delete model");
			}
		});
	};

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button variant="ghost" size="sm">
						<Settings className="h-4 w-4" />
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Advanced Model Editor</DialogTitle>
						<DialogDescription>
							Advanced configuration for {model.modelName}
						</DialogDescription>
					</DialogHeader>

					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					<Tabs defaultValue="details" className="w-full">
						<TabsList className="grid w-full grid-cols-5">
							<TabsTrigger value="details">Details</TabsTrigger>
							<TabsTrigger value="links">Links</TabsTrigger>
							<TabsTrigger value="aliases">Aliases</TabsTrigger>
							<TabsTrigger value="organization">Organization</TabsTrigger>
							<TabsTrigger value="danger">Danger Zone</TabsTrigger>
						</TabsList>

						{/* MODEL DETAILS */}
						<TabsContent value="details" className="space-y-4">
							<div>
								<p className="text-sm text-muted-foreground mb-4">
									Add custom key-value details for this model
								</p>

								{details.map((detail, idx) => (
									<div key={idx} className="flex gap-2 mb-2">
										<Input
											placeholder="Detail name"
											value={detail.name}
											onChange={(e) => {
												const newDetails = [...details];
												newDetails[idx].name = e.target.value;
												setDetails(newDetails);
											}}
										/>
										<Input
											placeholder="Detail value"
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
									onClick={() =>
										setDetails([...details, { name: "", value: "" }])
									}
								>
									<Plus className="h-4 w-4 mr-2" />
									Add Detail
								</Button>
							</div>

							<Button onClick={handleSaveDetails} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Save Details
							</Button>
						</TabsContent>

						{/* MODEL LINKS */}
						<TabsContent value="links" className="space-y-4">
							<div>
								<p className="text-sm text-muted-foreground mb-4">
									Add external links for documentation, blog posts, etc.
								</p>

								{links.map((link, idx) => (
									<div key={idx} className="flex gap-2 mb-2">
										<Select
											value={link.type}
											onValueChange={(value) => {
												const newLinks = [...links];
												newLinks[idx].type = value;
												setLinks(newLinks);
											}}
										>
											<SelectTrigger className="w-[180px]">
												<SelectValue placeholder="Link type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="documentation">Documentation</SelectItem>
												<SelectItem value="blog">Blog Post</SelectItem>
												<SelectItem value="paper">Research Paper</SelectItem>
												<SelectItem value="github">GitHub</SelectItem>
												<SelectItem value="pricing">Pricing Page</SelectItem>
												<SelectItem value="api">API Reference</SelectItem>
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
									onClick={() => setLinks([...links, { type: "", url: "" }])}
								>
									<Plus className="h-4 w-4 mr-2" />
									Add Link
								</Button>
							</div>

							<Button onClick={handleSaveLinks} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Save Links
							</Button>
						</TabsContent>

						{/* MODEL ALIASES */}
						<TabsContent value="aliases" className="space-y-4">
							<div>
								<p className="text-sm text-muted-foreground mb-4">
									Manage alternative names/identifiers for this model
								</p>

								{aliases.map((alias, idx) => (
									<div key={idx} className="flex gap-2 mb-2 items-center">
										<Input
											placeholder="Alias name"
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
												className="cursor-pointer font-normal"
											>
												Enabled
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
									Add Alias
								</Button>
							</div>

							<Button onClick={handleSaveAliases} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Save Aliases
							</Button>
						</TabsContent>

						{/* ORGANIZATION */}
						<TabsContent value="organization" className="space-y-4">
							<div>
								<Label htmlFor="organisation-select">Organization</Label>
								<Select
									value={selectedOrg}
									onValueChange={setSelectedOrg}
								>
									<SelectTrigger id="organisation-select">
										<SelectValue placeholder="Select organization" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">None</SelectItem>
										{organisations.map((org) => (
											<SelectItem key={org.id} value={org.id}>
												{org.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground mt-2">
									Current: {model.organisationName || "None"}
								</p>
							</div>

							<Button onClick={handleSaveOrganization} disabled={isPending}>
								{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Update Organization
							</Button>
						</TabsContent>

						{/* DANGER ZONE */}
						<TabsContent value="danger" className="space-y-4">
							<div className="border border-red-200 rounded-lg p-4 bg-red-50">
								<h3 className="text-lg font-semibold text-red-900 mb-2">
									Danger Zone
								</h3>
								<p className="text-sm text-red-800 mb-4">
									These actions are irreversible. Please be certain before
									proceeding.
								</p>

								<Button
									variant="destructive"
									onClick={() => setShowDeleteConfirm(true)}
									disabled={isPending}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete Model
								</Button>
							</div>
						</TabsContent>
					</Tabs>
				</DialogContent>
			</Dialog>

			<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete <strong>{model.modelName}</strong> and
							all associated data (provider models, pricing rules, benchmarks,
							etc). This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteModel}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete Permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
