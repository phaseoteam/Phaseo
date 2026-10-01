"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type SettingChange = {
    label: string;
    value: string;
};

type ChatNewChatDialogProps = {
    open: boolean;
    changes: SettingChange[];
    onOpenChange: (open: boolean) => void;
    onUseCurrent: () => void;
    onUseDefaults: () => void;
};

export function ChatNewChatDialog({
    open,
    changes,
    onOpenChange,
    onUseCurrent,
    onUseDefaults,
}: ChatNewChatDialogProps) {
	const t = useTranslations("Product.chat.newChatDialog");
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
                <DialogHeader className="space-y-2 text-left">
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>
                        {t("description")}
                    </DialogDescription>
                </DialogHeader>
                {changes.length > 0 ? (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <ul className="space-y-1">
                            {changes.map((change) => (
                                <li key={change.label} className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">{change.label}</span>
                                    <span className="truncate text-right">{change.value}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                <DialogFooter>
                    <Button className="w-full sm:w-auto" variant="ghost" onClick={onUseDefaults}>
                        {t("useDefaults")}
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={onUseCurrent}>
                        {t("useCurrent")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
