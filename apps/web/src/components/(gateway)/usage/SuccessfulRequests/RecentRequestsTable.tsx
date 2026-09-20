"use client";

import React from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export type RecentRequestRow = {
    request_id?: string | null;
    created_at: string;
    model_id?: string | null;
    usage?: any;
    cost_nanos?: number | null;
};

function computeTotalTokens(u: any): number {
    if (Array.isArray(u)) return u.reduce((s, x) => s + computeTotalTokens(x), 0);
    if (!u || typeof u !== 'object') return 0;
    const entries = Object.entries(u)
        .filter(([k, v]) => k.toLowerCase().includes('token') && k.toLowerCase() !== 'total_tokens')
        .map(([, v]) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0);
    return entries.reduce((s, n) => s + n, 0);
}
const getTokens = (u: any) => computeTotalTokens(u);

export default function RecentRequestsTable({
    rows,
    onSelect,
}: {
    rows: RecentRequestRow[];
    onSelect: (row: RecentRequestRow) => void;
}) {
	const format = useDisplayFormatters();
    return (
        <div className="overflow-auto">
            <Table>
                <TableHeader>
                    <TableRow className="h-8">
                        <TableHead className="py-1">Time</TableHead>
                        <TableHead className="py-1">Model</TableHead>
                        <TableHead className="py-1 text-right">Spend</TableHead>
                        <TableHead className="py-1 text-right">Tokens</TableHead>
                        <TableHead className="w-[40px] py-1"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r, idx) => {
                        const spend = Number(r.cost_nanos ?? 0) / 1e9;
                        const tokens = getTokens(r.usage);
                        return (
                            <TableRow key={idx} className="h-8">
                                <TableCell className="py-1 align-middle">
                                {format.dateTime(r.created_at)}
                                </TableCell>
                                <TableCell className="py-1 align-middle">
                                    {r.model_id ?? "-"}
                                </TableCell>
								<TableCell className="py-1 align-middle text-right">
									{format.number(spend, {
										style: "currency",
										currency: "USD",
										maximumFractionDigits: 5,
										notation: "standard",
									})}
								</TableCell>
								<TableCell className="py-1 align-middle text-right">
									{format.number(tokens, {
										maximumFractionDigits: 0,
										notation: "standard",
									})}
                                </TableCell>
                                <TableCell className="py-1 align-middle">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onSelect(r)}
                                        aria-label="View details"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
