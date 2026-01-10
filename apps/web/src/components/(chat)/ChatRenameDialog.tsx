"use client";

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ChatRenameDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
};

export function ChatRenameDialog({
    open,
    onOpenChange,
    value,
    onChange,
    onSave,
}: ChatRenameDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename chat</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="chat-title">Title</Label>
                    <Input
                        id="chat-title"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </div>
                <DialogFooter>
                    <Button onClick={onSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
