"use client";

import { useMemo, useState, useTransition } from "react";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import { toast } from "sonner";
import { BarChart3, Database, Percent, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import type { DataContributionSettings } from "@/lib/fetchers/internal/settingsTypes";
import {
	createDataContributionClassifier,
	deleteDataContributionClassifier,
	setDataContributionClassifierEnabled,
	updateDataContributionConsent,
} from "@/app/(dashboard)/settings/privacy/actions";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

const DEFAULT_CATEGORIES = JSON.stringify({
	product: ["support", "sales", "onboarding"],
	operation: ["research", "content", "automation", "other"],
}, null, 2);

export function DataContributionSettingsCard({ initial }: { initial: DataContributionSettings }) {
	const format = useDisplayFormatters();
	const formatMoney = (nanos: number) => format.number(nanos / 1_000_000_000, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
		notation: "standard",
	});
	const router = useRouter();
	const [enabled, setEnabled] = useState(initial.enabled);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const [name, setName] = useState("");
	const [instructions, setInstructions] = useState("Classify the request by its business use case. Return only labels from the taxonomy.");
	const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

	const categoryTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const row of initial.analytics) {
			totals.set(row.primary_category, (totals.get(row.primary_category) ?? 0) + Number(row.request_count ?? 0));
		}
		return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
	}, [initial.analytics]);

	function changeConsent(next: boolean) {
		startTransition(async () => {
			try {
				await updateDataContributionConsent(next);
				setEnabled(next);
				setConfirmOpen(false);
				toast.success(next ? "Data contribution enabled" : "Data contribution disabled");
				router.refresh();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Could not update data contribution");
			}
		});
	}

	function createClassifier() {
		startTransition(async () => {
			try {
				const parsed = JSON.parse(categories) as Record<string, string[]>;
				await createDataContributionClassifier({ name, instructions, categories: parsed, serviceTier: "flex" });
				setCreateOpen(false);
				setName("");
				toast.success("Classifier created");
				router.refresh();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Could not create classifier");
			}
		});
	}

	return (
		<section className="overflow-hidden rounded-xl border bg-background">
			<div className="grid gap-5 border-b bg-gradient-to-br from-emerald-500/10 via-background to-sky-500/10 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-base font-semibold">Contribute data, save {initial.discountBps / 100}%</h2>
						<Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Active" : "Opt in"}</Badge>
					</div>
					<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
						Every eligible non-BYOK request receives a {initial.discountBps / 100}% discount. Phaseo retains up to 100% of successful prompts and completions
						after redacting secrets and personal information, in a dedicated private bucket for no more than 30 days.
						Only {initial.classifierSampleRateBps / 100}% is currently selected for upstream classification.
						Only aggregate task statistics appear here; raw content is never published.
					</p>
				</div>
				{enabled ? (
					<Button variant="outline" disabled={pending} onClick={() => changeConsent(false)}>Disable contribution</Button>
				) : (
					<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<DialogTrigger asChild><Button disabled={pending}>Review and enable</Button></DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Enable discounted data contribution?</DialogTitle>
								<DialogDescription>
									This is separate from private I/O logging and provider data policies. Up to 100% of successful,
									non-BYOK prompts and completions will be redacted and retained for 30 days. Upstream classification is independently sampled.
								</DialogDescription>
							</DialogHeader>
							<div className="rounded-lg border bg-muted/30 p-3 text-sm">
								You can revoke consent at any time. Revocation stops new capture, removes the discount, and queues previously captured objects for deletion within 24 hours.
							</div>
							<DialogFooter>
								<DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
								<Button disabled={pending} onClick={() => changeConsent(true)}>Enable and save {initial.discountBps / 100}%</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}
			</div>

			<div className="grid border-b sm:grid-cols-3">
				<div className="flex items-center gap-3 border-b p-4 sm:border-b-0 sm:border-r"><Percent className="size-4 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Discount</div><div className="font-semibold">{initial.discountBps / 100}% per request</div></div></div>
				<div className="flex items-center gap-3 border-b p-4 sm:border-b-0 sm:border-r"><Database className="size-4 text-sky-600" /><div><div className="text-xs text-muted-foreground">Retained (30 days)</div><div className="font-semibold">{format.number(initial.contributions30d)} requests</div></div></div>
				<div className="flex items-center gap-3 p-4"><BarChart3 className="size-4 text-violet-600" /><div><div className="text-xs text-muted-foreground">Discount earned</div><div className="font-semibold">{formatMoney(initial.discountNanos30d)}</div></div></div>
			</div>

			<div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div><h3 className="text-sm font-semibold">Classifiers</h3><p className="text-xs text-muted-foreground">Run asynchronously on a deterministic {initial.classifierSampleRateBps / 100}% upstream sample, using Flex by default.</p></div>
						<Dialog open={createOpen} onOpenChange={setCreateOpen}>
							<DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="mr-1 size-4" />Custom classifier</Button></DialogTrigger>
							<DialogContent className="sm:max-w-2xl">
								<DialogHeader><DialogTitle>Create classifier</DialogTitle><DialogDescription>Define private labels for your own domain. The built-in task classifier remains the recommended baseline.</DialogDescription></DialogHeader>
								<div className="space-y-4">
									<div className="space-y-1.5"><Label htmlFor="classifier-name">Name</Label><Input id="classifier-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer intent" /></div>
									<div className="space-y-1.5"><Label htmlFor="classifier-instructions">Instructions</Label><textarea id="classifier-instructions" className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></div>
									<div className="space-y-1.5"><Label htmlFor="classifier-categories">Categories (JSON)</Label><textarea id="classifier-categories" className="min-h-44 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" value={categories} onChange={(event) => setCategories(event.target.value)} /></div>
								</div>
								<DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled={pending || !name.trim()} onClick={createClassifier}>Create classifier</Button></DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
					<div className="divide-y rounded-lg border">
						{initial.classifiers.map((classifier) => (
							<div key={classifier.id} className="flex items-start justify-between gap-4 p-3">
								<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{classifier.name}</span><Badge variant="outline">{classifier.kind === "phaseo_task" ? "Starter" : "Custom"}</Badge><Badge variant="secondary">{classifier.service_tier}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{Object.values(classifier.categories).flat().length} labels · {classifier.model}</p></div>
								<div className="flex items-center gap-2">
									<Switch checked={classifier.enabled} disabled={pending || classifier.kind === "phaseo_task"} onCheckedChange={(next) => startTransition(async () => { await setDataContributionClassifierEnabled(classifier.id, next); router.refresh(); })} />
									{classifier.kind === "custom" ? <Button size="icon" variant="ghost" disabled={pending} aria-label={`Delete ${classifier.name}`} onClick={() => startTransition(async () => { await deleteDataContributionClassifier(classifier.id); toast.success("Classifier deleted"); router.refresh(); })}><Trash2 className="size-4" /></Button> : null}
								</div>
							</div>
						))}
						{!initial.classifiers.length ? <div className="p-4 text-sm text-muted-foreground">Enable contribution to install the starter taxonomy.</div> : null}
					</div>
				</div>

				<div className="space-y-3">
					<div><h3 className="text-sm font-semibold">Top tasks</h3><p className="text-xs text-muted-foreground">Private classification rollups retained after raw I/O expires.</p></div>
					<div className="space-y-2 rounded-lg border p-3">
						{categoryTotals.map(([category, count]) => {
							const max = categoryTotals[0]?.[1] ?? 1;
							return <div key={category} className="space-y-1"><div className="flex justify-between gap-3 text-xs"><span className="truncate">{category.replaceAll("_", " ")}</span><span className="tabular-nums text-muted-foreground">{format.number(count)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div></div>;
						})}
						{!categoryTotals.length ? <p className="py-6 text-center text-xs text-muted-foreground">Classifications will appear after sampled requests are processed.</p> : null}
					</div>
				</div>
			</div>
		</section>
	);
}
