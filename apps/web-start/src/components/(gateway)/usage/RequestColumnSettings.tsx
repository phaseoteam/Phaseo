"use client";

import { useEffect, useState } from "react";
import TableSettings from "./TableSettings";
import {
	REQUEST_COLUMNS,
	REQUEST_COLUMNS_STORAGE_KEY,
	REQUEST_DENSITY_STORAGE_KEY,
	defaultRequestColumns,
	normalizeRequestColumns,
	normalizeRequestDensity,
	type RequestColumnPreference,
	type RequestTableDensity,
} from "./requestColumns";

export function useRequestColumns() {
	const [columns, setColumns] = useState(defaultRequestColumns);
	const [density, setDensity] = useState<RequestTableDensity>("regular");
	useEffect(() => {
		try {
			setColumns(
				normalizeRequestColumns(
					JSON.parse(
						localStorage.getItem(REQUEST_COLUMNS_STORAGE_KEY) ?? "null",
					),
				),
			);
		} catch {
			/* Use defaults when browser storage is unavailable. */
		}
	}, []);
	useEffect(() => {
		try {
			setDensity(
				normalizeRequestDensity(
					localStorage.getItem(REQUEST_DENSITY_STORAGE_KEY),
				),
			);
		} catch {
			/* Use regular density when storage is unavailable. */
		}
	}, []);
	function updateDensity(next: RequestTableDensity) {
		setDensity(next);
		try {
			localStorage.setItem(REQUEST_DENSITY_STORAGE_KEY, next);
		} catch {
			/* Preferences still work for this visit. */
		}
	}
	function updateColumns(next: RequestColumnPreference[]) {
		const normalized = normalizeRequestColumns(next);
		setColumns(normalized);
		try {
			localStorage.setItem(
				REQUEST_COLUMNS_STORAGE_KEY,
				JSON.stringify(normalized),
			);
		} catch {
			/* Preferences still work for this visit. */
		}
	}
	return { columns, updateColumns, density, updateDensity };
}

export default function RequestColumnSettings(props: {
	columns: RequestColumnPreference[];
	onChange: (columns: RequestColumnPreference[]) => void;
	density: RequestTableDensity;
	onDensityChange: (density: RequestTableDensity) => void;
}) {
	return (
		<TableSettings
			{...props}
			definitions={REQUEST_COLUMNS}
			tableLabel="request"
			onReset={() => props.onChange(defaultRequestColumns())}
		/>
	);
}
