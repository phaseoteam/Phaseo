"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OAUTH_SCOPE_OPTIONS, type OAuthScopeOption } from "@/lib/oauth/scopes";

export default function OAuthScopeSelector({
	selectedScopes,
	onChange,
	disabled = false,
}: {
	selectedScopes: string[];
	onChange: (scopes: string[]) => void;
	disabled?: boolean;
}) {
	const selected = new Set(selectedScopes);
	const toggle = (scope: string, checked: boolean) => {
		const next = checked
			? Array.from(new Set([...selectedScopes, scope]))
			: selectedScopes.filter((entry) => entry !== scope);
		onChange(next);
	};
	const groups: OAuthScopeOption["group"][] = ["Identity", "Access", "Read", "Write", "Delete"];

	return (
		<div className="space-y-4">
			{groups.map((group) => {
				const options = OAUTH_SCOPE_OPTIONS.filter((option) => option.group === group);
				return (
					<div key={group} className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">{group}</Label>
						<div className="grid gap-2 sm:grid-cols-2">
							{options.map((option) => {
								const id = `oauth-scope-${option.value}`;
								return (
									<label key={option.value} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40 has-[[data-checked]]:border-primary/60 has-[[data-checked]]:bg-primary/5">
										<Checkbox id={id} checked={selected.has(option.value)} disabled={disabled} onCheckedChange={(checked) => toggle(option.value, checked === true)} />
										<span className="min-w-0">
											<span className="block font-medium">{option.label}</span>
											<span className="block text-xs text-muted-foreground">{option.description}</span>
										</span>
									</label>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
