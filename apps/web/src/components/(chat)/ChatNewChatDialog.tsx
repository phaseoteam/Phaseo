"use client";

import * as React from "react";

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
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader className="space-y-2 text-left">
                    <DialogTitle>Reuse chat parameters?</DialogTitle>
                    <DialogDescription>
                        This chat has custom settings. Do you want to carry them into your new
                        chat or reset to defaults?
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
                    <Button variant="ghost" onClick={onUseDefaults}>
                        Use defaults
                    </Button>
                    <Button onClick={onUseCurrent}>Use current</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
