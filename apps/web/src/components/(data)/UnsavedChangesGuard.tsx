"use client";

import { NavigationGuardProvider, useNavigationGuard } from "next-navigation-guard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function CatalogNavigationGuardProvider({ children }: { children: React.ReactNode }) {
  return <NavigationGuardProvider>{children}</NavigationGuardProvider>;
}

export function UnsavedChangesGuard({ dirty, saving = false, allowNavigation }: { dirty: boolean | (() => boolean); saving?: boolean; allowNavigation?: () => boolean }) {
  const guard = useNavigationGuard({ enabled: () => !allowNavigation?.() && (saving || (typeof dirty === "function" ? dirty() : dirty)) });
  return <AlertDialog open={guard.active} onOpenChange={(open) => { if (!open) guard.reject(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{saving ? "Save in progress" : "Leave with unsaved changes?"}</AlertDialogTitle>
        <AlertDialogDescription>{saving ? "Wait for the save to finish before leaving this editor." : "Your unfinished changes will be lost. Stay here to save them, or discard them and leave."}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={guard.reject}>Stay here</AlertDialogCancel>
        <AlertDialogAction disabled={saving} onClick={guard.accept}>Discard and leave</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
