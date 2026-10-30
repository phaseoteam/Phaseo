import type { ModelOption } from "../../shared/workspace";
import { Select } from "./Select";
import { emptyModelFilters, modelOrganisation, type ModelFilters } from "./modelFilters";

export function PhaseoModelFilters({ models, filters, onChange, count }: { models: ModelOption[]; filters: ModelFilters; onChange: (filters: ModelFilters) => void; count: number }) {
	const organisations = new Map(models.map(model => [modelOrganisation(model), model.organisationName ?? modelOrganisation(model)]));
	const options = [{ value: "", label: "All organizations" }, ...[...organisations].filter(([id]) => id).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
	const active = filters.organisation || filters.free || filters.new || filters.favorites;
	return <div className="phaseo-model-filters">
		<Select label="Model organization" value={filters.organisation} onValueChange={organisation => onChange({ ...filters, organisation })} options={options} />
		<div className="phaseo-model-quick-filters" aria-label="Model filters">{([['free', 'Free'], ['new', 'New'], ['favorites', 'Favorites']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={filters[key]} onClick={() => onChange({ ...filters, [key]: !filters[key] })}>{label}</button>)}{active && <button type="button" onClick={() => onChange(emptyModelFilters)}>Clear</button>}<span role="status">{count} models</span></div>
	</div>;
}
