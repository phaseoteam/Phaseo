import { NavigationGuardProvider, useNavigationGuard } from "@/lib/navigationGuard";
import { useTranslations } from "@/i18n/react";
import { useWorkspaceSwitchGuard } from "@/lib/workspace/switchGuard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function CatalogNavigationGuardProvider({ children }: { children: React.ReactNode }) {
  return <NavigationGuardProvider>{children}</NavigationGuardProvider>;
}

export function UnsavedChangesGuard({ dirty, saving = false, allowNavigation, guardWorkspaceSwitch = false }: { dirty: boolean | (() => boolean); saving?: boolean; allowNavigation?: () => boolean; guardWorkspaceSwitch?: boolean }) {
  const t = useTranslations("Common.ui.localisationGaps");
  const guard = useNavigationGuard({ enabled: () => !allowNavigation?.() && (saving || (typeof dirty === "function" ? dirty() : dirty)) });
  const workspaceGuard = useWorkspaceSwitchGuard(guardWorkspaceSwitch && (saving || (typeof dirty === "function" ? dirty() : dirty)));
  const activeGuard = workspaceGuard.active ? workspaceGuard : guard;
  return <AlertDialog open={activeGuard.active} onOpenChange={(open) => { if (!open) activeGuard.reject(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{saving ? t("saveInProgress") : t("leaveUnsaved")}</AlertDialogTitle>
        <AlertDialogDescription>{saving ? t("waitForSave") : t("unsavedWarning")}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={activeGuard.reject}>{t("stay")}</AlertDialogCancel>
        <AlertDialogAction disabled={saving} onClick={activeGuard.accept}>{t("discardLeave")}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
