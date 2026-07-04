"use client";

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

type ChatDeleteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    count?: number;
};

export function ChatDeleteDialog({
    open,
    onOpenChange,
    onConfirm,
    count = 1,
}: ChatDeleteDialogProps) {
    const multiple = count > 1;
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {multiple ? `Delete ${count} chats` : "Delete chat"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {multiple
                            ? "This will permanently delete the selected chats and their messages."
                            : "This will permanently delete the chat and its messages."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
