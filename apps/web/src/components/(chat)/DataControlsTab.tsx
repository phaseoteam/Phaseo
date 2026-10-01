"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { upsertChat } from "@/lib/indexeddb/chats";
import type { ChatThread } from "@/lib/indexeddb/chats";

type DataControlsTabProps = {
	onExportChats: () => void;
};

export function DataControlsTab({ onExportChats }: DataControlsTabProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const t = useTranslations("Product.chat.dataControls");

	const handleImportChats = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			if (!data.chats || !Array.isArray(data.chats)) {
				throw new Error(t("invalidFileFormat"));
			}

			const chats: ChatThread[] = data.chats;

			// Validate each chat has required fields
			for (const chat of chats) {
				if (!chat.id || !chat.title || !chat.modelId || !chat.createdAt || !chat.updatedAt || !Array.isArray(chat.messages) || !chat.settings) {
					throw new Error(t("invalidChatData"));
				}
			}

			// Upsert all chats to IndexedDB
			for (const chat of chats) {
				await upsertChat(chat);
			}

			alert(t("importSuccess", { count: chats.length }));

			// Refresh the page to show imported chats
			window.location.reload();
		} catch (error) {
			console.error("Import error:", error);
			const message =
				error instanceof Error &&
				(error.message === t("invalidFileFormat") || error.message === t("invalidChatData"))
					? error.message
					: t("unknownError");
			alert(t("importFailure", {
				message,
			}));
		}

		// Reset the input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className="px-2 pt-2 pb-0">
			<Button
				variant="ghost"
				className="min-w-0 flex-1 w-full justify-start pr-2 truncate"
				onClick={onExportChats}
			>
				<Download className="mr-2 h-4 w-4" />
				{t("exportChats")}
			</Button>
			<Button
				variant="ghost"
				className="min-w-0 flex-1 w-full justify-start pr-2 truncate"
				onClick={() => fileInputRef.current?.click()}
			>
				<Upload className="mr-2 h-4 w-4" />
				{t("importChats")}
			</Button>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleImportChats}
				className="hidden"
			/>
		</div>
	);
}
