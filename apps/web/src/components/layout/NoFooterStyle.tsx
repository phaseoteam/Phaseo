export default function NoFooterStyle() {
	return (
		<style>{`
			#dashboard-shell > footer {
				display: none !important;
			}
		`}</style>
	);
}
