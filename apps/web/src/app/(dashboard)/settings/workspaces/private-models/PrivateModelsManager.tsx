"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSettingsRouter as useRouter } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAccountQueries } from "@/lib/query/invalidation";
import { useTransition } from "react";
import { KeyRound, LockKeyhole, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PrivateModelSetting } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { updatePrivateModelAction } from "./actions";

type Props = { initialModels: PrivateModelSetting[]; canManage: boolean; hasWorkspace: boolean };
export function PrivateModelsManager({ initialModels, canManage, hasWorkspace }: Props) {
	const t = useTranslations("SettingsUI");
	const router = useRouter(); const [pending, startTransition] = useTransition();
	const queryClient = useQueryClient();
	if (!hasWorkspace) return <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">{t("privateModelsCopy.selectWorkspace")}</div>;
	return <div className="space-y-4">
		<div className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border bg-background"><LockKeyhole className="size-4" /></span><div><p className="text-sm font-medium">{t("privateModelsCopy.workspaceCatalogue")}</p><p className="text-xs text-muted-foreground">{t("privateModelsCopy.membersOnly")}</p></div></div>{canManage ? <Button size="sm" asChild><Link href="/settings/workspaces/private-models/new"><Plus className="mr-1.5 size-4" />{t("privateModelsCopy.addModel")}</Link></Button> : null}</div>
		{initialModels.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><LockKeyhole className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-medium">{t("privateModelsCopy.noModels")}</p><p className="mt-1 text-sm text-muted-foreground">{t("privateModelsCopy.connectCatalogue")}</p>{canManage ? <Button className="mt-4" size="sm" asChild><Link href="/settings/workspaces/private-models/new"><Plus className="mr-1.5 size-4" />{t("privateModelsCopy.addModel")}</Link></Button> : null}</div> : <div className="overflow-hidden rounded-xl border">{initialModels.map((model) => <div key={model.id} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{model.name}</p><span className={`size-2 rounded-full ${model.enabled ? "bg-emerald-500" : "bg-muted-foreground/35"}`} /><span className="text-xs text-muted-foreground">{model.enabled ? t("privateModelsCopy.enabled") : t("privateModelsCopy.disabled")}</span></div><p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{model.model_id}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><KeyRound className="size-3" />{model.credential_prefix ?? "••••"}…{model.credential_suffix ?? "••••"}</p></div>{canManage ? <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => { try { await updatePrivateModelAction(model.id, { enabled: !model.enabled }); await invalidateAccountQueries(queryClient); router.refresh(); } catch { toast.error(t("privateModelsCopy.updateFailed")); } })}>{model.enabled ? t("privateModelsCopy.disable") : t("privateModelsCopy.enable")}</Button><Button variant="outline" size="sm" asChild><Link href={`/settings/workspaces/private-models/${model.id}`}><Pencil className="mr-1.5 size-3.5" />{t("privateModelsCopy.edit")}</Link></Button></div> : null}</div>)}</div>}
	</div>;
}
