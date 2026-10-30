export function serializeJsonLd(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

export function JsonLdScript(props: { data: unknown; id: string }) {
	return (
		<script
			id={props.id}
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(props.data) }}
		/>
	);
}
