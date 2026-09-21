"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	normalizeTableColumns,
	type TableColumnDefinition,
	type TableColumnPreference,
	type TableDensity,
} from "./tablePreferences";

function normalizeDensity(value: unknown): TableDensity {
	return value === "compact" || value === "expanded" ? value : "regular";
}

export function useTablePreferences<Id extends string>(
	tableId: string,
	definitions: readonly TableColumnDefinition<Id>[],
) {
	const columnsKey = `phaseo.${tableId}.columns.v1`;
	const densityKey = `phaseo.${tableId}.density.v1`;
	const defaults = useMemo(
		() => normalizeTableColumns(null, definitions),
		[definitions],
	);
	const [columns, setColumns] = useState<TableColumnPreference<Id>[]>(defaults);
	const [density, setDensity] = useState<TableDensity>("regular");

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			try {
				setColumns(
					normalizeTableColumns(
						JSON.parse(localStorage.getItem(columnsKey) ?? "null"),
						definitions,
					),
				);
				setDensity(normalizeDensity(localStorage.getItem(densityKey)));
			} catch {
				setColumns(defaults);
				setDensity("regular");
			}
		});
		return () => window.cancelAnimationFrame(frame);
	}, [columnsKey, defaults, definitions, densityKey]);

	const updateColumns = useCallback(
		(next: TableColumnPreference<Id>[]) => {
			const normalized = normalizeTableColumns(next, definitions);
			setColumns(normalized);
			try {
				localStorage.setItem(columnsKey, JSON.stringify(normalized));
			} catch {
				/* Preferences still work for this visit. */
			}
		},
		[columnsKey, definitions],
	);

	const resetColumns = useCallback(() => {
		setColumns(defaults);
		try {
			localStorage.removeItem(columnsKey);
		} catch {
			/* Preferences still work for this visit. */
		}
	}, [columnsKey, defaults]);

	const updateDensity = useCallback(
		(next: TableDensity) => {
			setDensity(next);
			try {
				localStorage.setItem(densityKey, next);
			} catch {
				/* Preferences still work for this visit. */
			}
		},
		[densityKey],
	);

	return { columns, density, updateColumns, updateDensity, resetColumns };
}
