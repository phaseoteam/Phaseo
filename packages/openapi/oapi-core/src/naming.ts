const NON_ALPHANUMERIC = /[^a-zA-Z0-9]+/g;

export function pascalCaseModelName(raw: string): string {
	return toPascalCase(raw);
}

export function camelCaseOperationName(raw: string): string {
	const pascal = toPascalCase(raw);
	return pascal.length === 0 ? "" : pascal[0].toLowerCase() + pascal.slice(1);
}

export function ensureUniqueName(base: string, used: Set<string>): string {
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	let counter = 2;
	while (used.has(`${base}${counter}`)) {
		counter += 1;
	}
	const unique = `${base}${counter}`;
	used.add(unique);
	return unique;
}

export function deriveOperationId(method: string, path: string): string {
	const segments = path
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			if (segment.startsWith("{") && segment.endsWith("}")) {
				const name = segment.slice(1, -1);
				return `by-${name}`;
			}
			return segment;
		});
	const raw = [method, ...segments].join("-");
	return camelCaseOperationName(raw);
}

function toPascalCase(value: string): string {
	return value
		.replace(NON_ALPHANUMERIC, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}
