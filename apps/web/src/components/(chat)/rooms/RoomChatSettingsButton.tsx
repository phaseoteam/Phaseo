"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Download, Paintbrush, Settings, Trash2 } from "lucide-react";
import type { NonTextRoomId, RoomHistoryRecord } from "@/lib/indexeddb/chatRoomHistory";
import {
	deleteRoomHistory,
	listRoomHistory,
} from "@/lib/indexeddb/chatRoomHistory";
import {
	getRoomStorageKeys,
	PERSONALIZATION_ACCENT_COLORS,
	type PersonalizationSettings,
} from "@/components/(chat)/playground/chat-playground-core";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SettingsTab = "personalization" | "data-controls";

type RoomChatSettingsButtonProps = {
	roomId: NonTextRoomId;
	roomLabel: string;
	onHistoryDeleted?: () => void;
};

const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
	name: "",
	role: "",
	notes: "",
	accentColor: "#111111",
};

function downloadJson(filename: string, value: unknown) {
	const blob = new Blob([JSON.stringify(value, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function RoomChatSettingsButton({
	roomId,
	roomLabel,
	onHistoryDeleted,
}: RoomChatSettingsButtonProps) {
	const storageKeys = useMemo(() => getRoomStorageKeys(roomId), [roomId]);
	const [open, setOpen] = useState(false);
	const [settingsTab, setSettingsTab] = useState<SettingsTab>("personalization");
	const [deleteAllOpen, setDeleteAllOpen] = useState(false);
	const [statusMessage, setStatusMessage] = useState<{
		type: "success" | "error" | "info";
		message: string;
	} | null>(null);
	const [personalization, setPersonalization] =
		useState<PersonalizationSettings>(DEFAULT_PERSONALIZATION);

	useEffect(() => {
		if (typeof window === "undefined") return;
		setPersonalization({
			name: window.localStorage.getItem(storageKeys.personalizationName) ?? "",
			role: window.localStorage.getItem(storageKeys.personalizationRole) ?? "",
			notes: window.localStorage.getItem(storageKeys.personalizationNotes) ?? "",
			accentColor:
				window.localStorage.getItem(storageKeys.personalizationAccent) ??
				"#111111",
		});
	}, [storageKeys]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			storageKeys.personalizationName,
			personalization.name,
		);
		window.localStorage.setItem(
			storageKeys.personalizationRole,
			personalization.role,
		);
		window.localStorage.setItem(
			storageKeys.personalizationNotes,
			personalization.notes,
		);
		window.localStorage.setItem(
			storageKeys.personalizationAccent,
			personalization.accentColor,
		);
	}, [personalization, storageKeys]);

	const handleExportHistory = async () => {
		try {
			const records = await listRoomHistory(roomId);
			downloadJson(`ai-stats-${roomId}-history-${Date.now()}.json`, {
				version: 1,
				exportedAt: new Date().toISOString(),
				room: roomId,
				records,
			});
			setStatusMessage({
				type: "success",
				message: `Exported ${records.length} ${records.length === 1 ? "item" : "items"}.`,
			});
		} catch (error) {
			setStatusMessage({
				type: "error",
				message: error instanceof Error ? error.message : "Export failed.",
			});
		}
	};

	const handleDeleteHistory = async () => {
		try {
			const records = await listRoomHistory(roomId);
			await Promise.all(
				records.map((record: RoomHistoryRecord) => deleteRoomHistory(record.id)),
			);
			onHistoryDeleted?.();
			setStatusMessage({
				type: "success",
				message: `Deleted ${records.length} ${records.length === 1 ? "item" : "items"}.`,
			});
		} catch (error) {
			setStatusMessage({
				type: "error",
				message: error instanceof Error ? error.message : "Delete failed.",
			});
		} finally {
			setDeleteAllOpen(false);
		}
	};

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setOpen(true)}
						aria-label="Settings"
					>
						<Settings className="h-5 w-5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Settings</TooltipContent>
			</Tooltip>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="overflow-hidden p-0 md:max-h-[520px] md:max-w-[760px] lg:max-w-[820px]">
					<DialogTitle className="sr-only">Settings</DialogTitle>
					<DialogDescription className="sr-only">
						Chat settings and local data controls.
					</DialogDescription>
					<div className="flex h-[520px] flex-1 overflow-hidden">
						<div className="hidden w-52 shrink-0 flex-col border-r border-border p-2 md:flex">
							<Button
								variant={settingsTab === "personalization" ? "secondary" : "ghost"}
								className="w-full justify-start gap-2"
								onClick={() => setSettingsTab("personalization")}
							>
								<Paintbrush className="h-4 w-4" />
								Personalization
							</Button>
							<Button
								variant={settingsTab === "data-controls" ? "secondary" : "ghost"}
								className="w-full justify-start gap-2"
								onClick={() => {
									setSettingsTab("data-controls");
									setStatusMessage(null);
								}}
							>
								<Database className="h-4 w-4" />
								Data Controls
							</Button>
						</div>
						<div className="flex flex-1 flex-col overflow-hidden">
							<div className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
								<Button
									size="sm"
									variant={settingsTab === "personalization" ? "secondary" : "ghost"}
									onClick={() => setSettingsTab("personalization")}
								>
									Personalization
								</Button>
								<Button
									size="sm"
									variant={settingsTab === "data-controls" ? "secondary" : "ghost"}
									onClick={() => {
										setSettingsTab("data-controls");
										setStatusMessage(null);
									}}
								>
									Data Controls
								</Button>
							</div>
							<div className="flex-1 overflow-y-auto p-4">
								{settingsTab === "personalization" ? (
									<div className="grid gap-3">
										<div className="grid gap-1">
											<p className="text-sm font-semibold text-foreground">
												Personalization
											</p>
											<p className="text-xs text-muted-foreground">
												Stored locally and scoped to {roomLabel.toLowerCase()}.
											</p>
										</div>
										<div className="grid gap-2">
											<Label htmlFor={`${roomId}-personal-name`}>Name</Label>
											<Input
												id={`${roomId}-personal-name`}
												value={personalization.name}
												onChange={(event) =>
													setPersonalization({
														...personalization,
														name: event.target.value,
													})
												}
												placeholder="Jane Doe"
											/>
										</div>
										<div className="grid gap-2">
											<Label htmlFor={`${roomId}-personal-role`}>Role</Label>
											<Input
												id={`${roomId}-personal-role`}
												value={personalization.role}
												onChange={(event) =>
													setPersonalization({
														...personalization,
														role: event.target.value,
													})
												}
												placeholder="Product manager"
											/>
										</div>
										<div className="grid gap-2">
											<Label htmlFor={`${roomId}-personal-notes`}>Notes</Label>
											<Textarea
												id={`${roomId}-personal-notes`}
												value={personalization.notes}
												onChange={(event) =>
													setPersonalization({
														...personalization,
														notes: event.target.value,
													})
												}
												placeholder="I like short, actionable responses."
												rows={3}
											/>
										</div>
										<div className="grid gap-2">
											<Label htmlFor={`${roomId}-accent-color`}>
												Accent color
											</Label>
											<Select
												value={personalization.accentColor}
												onValueChange={(value) =>
													setPersonalization({
														...personalization,
														accentColor: value,
													})
												}
											>
												<SelectTrigger id={`${roomId}-accent-color`}>
													<SelectValue placeholder="Select a color" />
												</SelectTrigger>
												<SelectContent>
													{PERSONALIZATION_ACCENT_COLORS.map((color) => (
														<SelectItem key={color.value} value={color.value}>
															<span className="flex items-center gap-2">
																<span
																	className="h-3 w-3 rounded-full border border-border"
																	style={{ backgroundColor: color.value }}
																/>
																{color.label}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								) : (
									<div className="grid gap-3">
										<div className="grid gap-1">
											<p className="text-sm font-semibold text-foreground">
												Data Controls
											</p>
											<p className="text-xs text-muted-foreground">
												Manage {roomLabel.toLowerCase()} history stored locally in this browser.
											</p>
										</div>
										<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
											<div>
												<p className="text-sm font-medium text-foreground">
													Export {roomLabel.toLowerCase()} history
												</p>
												<p className="text-xs text-muted-foreground">
													Download locally stored {roomLabel.toLowerCase()} history as JSON.
												</p>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={handleExportHistory}
												className="gap-1.5"
											>
												<Download className="h-4 w-4" />
												Export
											</Button>
										</div>
										<div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3">
											<div>
												<p className="text-sm font-medium text-foreground">
													Delete {roomLabel.toLowerCase()} history
												</p>
												<p className="text-xs text-muted-foreground">
													Remove locally stored {roomLabel.toLowerCase()} history from this browser.
												</p>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
												onClick={() => setDeleteAllOpen(true)}
											>
												<Trash2 className="h-4 w-4" />
												Delete
											</Button>
										</div>
										{statusMessage ? (
											<div
												className={cn(
													"rounded-lg border px-3 py-3",
													statusMessage.type === "success" &&
														"border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
													statusMessage.type === "error" &&
														"border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
													statusMessage.type === "info" &&
														"border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
												)}
											>
												<p className="text-sm font-medium">
													{statusMessage.message}
												</p>
											</div>
										) : null}
									</div>
								)}
							</div>
							<div className="border-t border-border px-4 py-3">
								<div className="flex justify-end">
									<Button onClick={() => setOpen(false)}>Done</Button>
								</div>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {roomLabel.toLowerCase()} history?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes locally stored {roomLabel.toLowerCase()} history
							from this browser. Export it first if you may need it later.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								void handleDeleteHistory();
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
