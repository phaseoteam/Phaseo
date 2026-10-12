import developmentIcon from "../../../assets/icon-development.svg";

export function PhaseoMark({ compact = false }: { compact?: boolean }) {
	return (
		<div className="brand" aria-label="Phaseo">
			{import.meta.env.DEV ? <img className="brand-mark development-brand-mark" src={developmentIcon} alt="" /> : <div className="brand-mark" aria-hidden="true" />}
			{compact ? null : <span className="brand-name">Phaseo</span>}
		</div>
	);
}
