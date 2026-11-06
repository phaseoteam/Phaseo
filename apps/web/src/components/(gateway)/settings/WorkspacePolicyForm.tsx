import type { FormEvent, ReactNode } from "react";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";

export function WorkspacePolicyForm({ children, canManage, dirty, saving, error, notice, onSave, onCancel }: {
	children: ReactNode;
	canManage: boolean;
	dirty: boolean;
	saving: boolean;
	error: string | null;
	notice?: string | null;
	onSave: () => Promise<void>;
	onCancel: () => void;
}) {
	const t = useTranslations("SettingsUI");
	function submit(event: FormEvent) {
		event.preventDefault();
		if (canManage && dirty && !saving) void onSave();
	}
	return <form onSubmit={submit} className="space-y-6">
		<UnsavedChangesGuard dirty={canManage && dirty} saving={saving} guardWorkspaceSwitch />
		{!canManage ? <p className="text-sm text-muted-foreground">{t("modelSuccessorRouting.adminsOnly")}</p> : null}
		<fieldset disabled={!canManage || saving} className="min-w-0 space-y-6">{children}</fieldset>
		{canManage ? <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
			<div className="mr-auto text-sm" role={error ? "alert" : "status"} aria-live="polite">
				{error ? <span className="text-destructive">{error}</span> : saving ? t("labels.saving") : dirty ? t("strings.Unsaved changes") : notice}
			</div>
			<Button type="button" variant="outline" disabled={!dirty || saving} onClick={onCancel}>{t("labels.cancel")}</Button>
			<Button type="submit" disabled={!dirty || saving}>{saving ? t("labels.saving") : error ? t("privateQuery.retry") : t("strings.Save changes")}</Button>
		</div> : null}
	</form>;
}
