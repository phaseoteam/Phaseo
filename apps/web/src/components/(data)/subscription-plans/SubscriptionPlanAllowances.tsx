import type { SubscriptionAllowance } from "@/lib/fetchers/subscription-plans/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SubscriptionPlanAllowances({ allowances }: { allowances: SubscriptionAllowance[] }) {
	if (!allowances.length) return null;
	return <section className="space-y-4">
		<h2 className="text-xl font-semibold">Usage allowances</h2>
		<Table aria-label="Usage allowances">
			<TableHeader><TableRow><TableHead>Allowance</TableHead><TableHead>Amount</TableHead><TableHead>Window</TableHead><TableHead>Conditions</TableHead></TableRow></TableHeader>
			<TableBody>{allowances.map((allowance) => <TableRow key={allowance.allowance_uuid}>
				<TableCell>{allowance.allowance_key}</TableCell>
				<TableCell>{allowance.display_text ?? (allowance.quantity_kind === "unlimited" ? "Unlimited" : allowance.quantity == null ? "Unspecified" : `${allowance.quantity}${allowance.quantity_max == null ? "" : `–${allowance.quantity_max}`} ${allowance.unit}`)}</TableCell>
				<TableCell>{allowance.window_unit ? `${allowance.window_count} ${allowance.window_unit}${allowance.window_count === 1 ? "" : "s"}${allowance.window_kind === "rolling" ? " rolling" : ""}` : "Unspecified"}</TableCell>
				<TableCell className="text-muted-foreground">{[allowance.allocation_basis !== "unknown" ? `Per ${allowance.allocation_basis}` : null,
					allowance.pool_scope !== "unknown" ? `${allowance.pool_scope.replaceAll("_", " ")} pool` : null,
					allowance.grant_condition, allowance.conditions].filter(Boolean).join(" · ") || "—"}</TableCell>
			</TableRow>)}</TableBody>
		</Table>
	</section>;
}
