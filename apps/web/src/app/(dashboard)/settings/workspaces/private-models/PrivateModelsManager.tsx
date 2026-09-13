"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { KeyRound, LockKeyhole, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PrivateModelSetting } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { updatePrivateModelAction } from "./actions";

type Props = { initialModels: PrivateModelSetting[]; canManage: boolean; hasWorkspace: boolean };
export function PrivateModelsManager({ initialModels, canManage, hasWorkspace }: Props) {
	const router = useRouter(); const [pending, startTransition] = useTransition();
	if (!hasWorkspace) return <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">Select a workspace to manage private models.</div>;
	return <div className="space-y-4">
		<div className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border bg-background"><LockKeyhole className="size-4" /></span><div><p className="text-sm font-medium">Workspace catalogue</p><p className="text-xs text-muted-foreground">Visible only to members of this workspace.</p></div></div>{canManage ? <Button size="sm" asChild><Link href="/settings/workspaces/private-models/new"><Plus className="mr-1.5 size-4" />Add model</Link></Button> : null}</div>
		{initialModels.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><LockKeyhole className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-medium">No private models</p><p className="mt-1 text-sm text-muted-foreground">Connect an OpenAI-compatible endpoint to add it to your workspace catalogue.</p>{canManage ? <Button className="mt-4" size="sm" asChild><Link href="/settings/workspaces/private-models/new"><Plus className="mr-1.5 size-4" />Add model</Link></Button> : null}</div> : <div className="overflow-hidden rounded-xl border">{initialModels.map((model) => <div key={model.id} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{model.name}</p><span className={`size-2 rounded-full ${model.enabled ? "bg-emerald-500" : "bg-muted-foreground/35"}`} /><span className="text-xs text-muted-foreground">{model.enabled ? "Enabled" : "Disabled"}</span></div><p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{model.model_id}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><KeyRound className="size-3" />{model.credential_prefix ?? "••••"}…{model.credential_suffix ?? "••••"}</p></div>{canManage ? <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => { try { await updatePrivateModelAction(model.id, { enabled: !model.enabled }); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the model."); } })}>{model.enabled ? "Disable" : "Enable"}</Button><Button variant="outline" size="sm" asChild><Link href={`/settings/workspaces/private-models/${model.id}`}><Pencil className="mr-1.5 size-3.5" />Edit</Link></Button></div> : null}</div>)}</div>}
	</div>;
}
