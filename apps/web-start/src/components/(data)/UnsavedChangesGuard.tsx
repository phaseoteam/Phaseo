"use client";

import { NavigationGuardProvider, useNavigationGuard } from "next-navigation-guard";
import { useTranslations } from "next-intl";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function CatalogNavigationGuardProvider({ children }: { children: React.ReactNode }) {
  return <NavigationGuardProvider>{children}</NavigationGuardProvider>;
}

export function UnsavedChangesGuard({ dirty, saving = false, allowNavigation }: { dirty: boolean | (() => boolean); saving?: boolean; allowNavigation?: () => boolean }) {
  const t = useTranslations("Common.ui.localisationGaps");
  const guard = useNavigationGuard({ enabled: () => !allowNavigation?.() && (saving || (typeof dirty === "function" ? dirty() : dirty)) });
  return <AlertDialog open={guard.active} onOpenChange={(open) => { if (!open) guard.reject(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{saving ? t("saveInProgress") : t("leaveUnsaved")}</AlertDialogTitle>
        <AlertDialogDescription>{saving ? t("waitForSave") : t("unsavedWarning")}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={guard.reject}>{t("stay")}</AlertDialogCancel>
        <AlertDialogAction disabled={saving} onClick={guard.accept}>{t("discardLeave")}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
