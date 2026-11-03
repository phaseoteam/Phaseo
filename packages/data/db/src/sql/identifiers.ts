import { UnsupportedFeatureError } from "../errors";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `name` passes the strict identifier allow-list. */
export function isSafeIdentifier(name: string): boolean {
	return IDENTIFIER.test(name);
}

/**
 * Double-quote an identifier after checking it against the allow-list
 * `^[A-Za-z_][A-Za-z0-9_]*$`. Anything else (spaces, quotes, dots, unicode)
 * is rejected rather than escaped, so no caller-controlled text reaches SQL.
 */
export function quoteIdent(name: string): string {
	if (!IDENTIFIER.test(name)) {
		throw new UnsupportedFeatureError(
			"identifier outside [A-Za-z_][A-Za-z0-9_]*",
			`Identifier ${JSON.stringify(name)} is not allowed by @phaseo/db (quoted or unusual names are not supported).`,
		);
	}
	return `"${name}"`;
}

export function quoteQualified(schema: string, name: string): string {
	return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

// Type names come from generated metadata (format_type output), never from a
// request. They still pass a conservative check because they are spliced in.
const TYPE_NAME = /^(?:"[A-Za-z_][A-Za-z0-9_]*"|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:"[A-Za-z_][A-Za-z0-9_]*"|[A-Za-z_][A-Za-z0-9_]*))?(?: (?:with|without|time|zone|varying|precision|double))*(?:\(\d+(?:,\s?\d+)?\))?(?: (?:with|without|time|zone))*(?:\[\])*$/;

export function assertTypeName(type: string): string {
	if (!TYPE_NAME.test(type)) {
		throw new UnsupportedFeatureError("unusual SQL type name", `Type ${JSON.stringify(type)} is not allowed by @phaseo/db.`);
	}
	return type;
}

// Casts in a select string (`col::text`) come from the request, so they are
// limited to plain identifiers (PostgREST also refuses anything else).
export function assertCastName(type: string): string {
	if (!IDENTIFIER.test(type)) {
		throw new UnsupportedFeatureError("cast to a non-identifier type", `Cast ::${type} is not allowed by @phaseo/db.`);
	}
	return type;
}
