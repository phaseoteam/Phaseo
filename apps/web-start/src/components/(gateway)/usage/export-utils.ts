/**
 * Export utilities for gateway usage data
 * Supports CSV and PDF export for tabular data
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportRow {
	[key: string]: string | number | null | undefined;
}

/**
 * Export data to CSV format
 * @param data Array of objects to export
 * @param filename Name of the file to download
 */
export function exportToCSV(data: ExportRow[], filename: string): void {
	if (!data || data.length === 0) {
		console.warn("No data to export");
		return;
	}

	const headers = Object.keys(data[0]);

	// Build CSV content
	const csv = [
		// Header row
		headers.join(","),
		// Data rows
		...data.map((row) =>
			headers
				.map((header) => {
					const val = row[header];
					// Convert to string
					const strVal = val?.toString() ?? "";
					// Escape commas and quotes
					if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
						return `"${strVal.replace(/"/g, '""')}"`;
					}
					return strVal;
				})
				.join(",")
		),
	].join("\n");

	// Create blob and trigger download
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * Export data to PDF format
 * @param data Array of objects to export
 * @param filename Name of the file to download
 * @param title Title to display on the PDF
 */
export function exportToPDF(
	data: ExportRow[],
	filename: string,
	title: string
): void {
	if (!data || data.length === 0) {
		console.warn("No data to export");
		return;
	}

	const doc = new jsPDF();

	// Add title
	doc.setFontSize(16);
	doc.text(title, 14, 15);

	// Add timestamp
	doc.setFontSize(10);
	doc.setTextColor(100);
	doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);

	// Prepare table data
	const headers = Object.keys(data[0]);
	const rows = data.map((row) =>
		headers.map((header) => {
			const val = row[header];
			return val?.toString() ?? "-";
		})
	);

	// Generate table
	autoTable(doc, {
		head: [headers],
		body: rows,
		startY: 30,
		styles: {
			fontSize: 8,
			cellPadding: 2,
		},
		headStyles: {
			fillColor: [51, 51, 51],
			textColor: [255, 255, 255],
			fontStyle: "bold",
		},
		alternateRowStyles: {
			fillColor: [245, 245, 245],
		},
		margin: { top: 30, left: 10, right: 10 },
	});

	// Save the PDF
	doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format cost in USD with appropriate precision
 */
export function formatCost(nanos: number | null | undefined): string {
	const dollars = Number(nanos ?? 0) / 1e9;
	return `$${dollars.toFixed(5)}`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number | null | undefined): string {
	if (num === null || num === undefined) return "-";
	return new Intl.NumberFormat().format(num);
}
