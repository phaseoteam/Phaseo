export function PhaseoMark({ compact = false }: { compact?: boolean }) {
	return (
		<div className="brand" aria-label="Phaseo">
			<div className="brand-mark" aria-hidden="true" />
			{compact ? null : <span className="brand-name">Phaseo</span>}
		</div>
	);
}
