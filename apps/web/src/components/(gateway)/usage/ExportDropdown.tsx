"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet } from "lucide-react";

interface ExportDropdownProps {
	onExportCSV: () => void;
	onExportPDF: () => void;
	disabled?: boolean;
}

export default function ExportDropdown({
	onExportCSV,
	onExportPDF,
	disabled = false,
}: ExportDropdownProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={disabled}>
					<Download className="mr-2 h-4 w-4" />
					Export
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={onExportCSV}>
					<FileSpreadsheet className="mr-2 h-4 w-4" />
					Export as CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={onExportPDF}>
					<FileText className="mr-2 h-4 w-4" />
					Export as PDF
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
