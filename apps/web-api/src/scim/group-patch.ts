import { z } from "zod";
import { SCIM_URNS } from "./constants";
import { ScimProtocolError } from "./errors";

const patchSchema = z.object({
	schemas: z.array(z.string()).refine((schemas) => schemas.includes(SCIM_URNS.patch)),
	Operations: z.array(z.object({ op: z.preprocess((value) => String(value).toLowerCase(), z.enum(["add", "remove", "replace"])), path: z.string().max(512).optional(), value: z.unknown().optional() })).min(1).max(100),
}).strict();
const memberSchema = z.object({ value: z.string().uuid() }).passthrough();
const filteredMemberPath = /^members\[value\s+eq\s+"([0-9a-f-]{36})"\]$/i;
// Identity providers often send the resource back as the value of a pathless PATCH. A Group's read-only
// attributes (RFC 7643 section 3.1: id and meta; section 4.2 adds none) and the schemas list aren't
// changes, so they are ignored rather than failing the PATCH. Unknown writable attributes are rejected.
const ECHOED_READ_ONLY = new Set(["id", "meta", "schemas"]);

export type GroupPatchChange =
	| { kind: "attributes"; values: { display_name?: string; external_id?: string | null } }
	| { kind: "members-add"; userIds: string[] }
	| { kind: "members-remove"; userIds: string[] }
	| { kind: "members-replace"; userIds: string[] };

type Op = "add" | "remove" | "replace";

function memberIds(value: unknown) {
	const members = z.array(memberSchema).max(10_000).safeParse(value);
	if (!members.success) throw new ScimProtocolError(400, "members must contain valid User identifiers.", "invalidValue");
	return members.data.map((member) => member.value);
}

/** One attribute of a Group. SCIM attribute names are case-insensitive (RFC 7643 section 2.1). */
function attributeChange(op: Op, attribute: string, value: unknown, label: string): GroupPatchChange {
	switch (attribute.toLowerCase()) {
		case "displayname":
			if (op === "remove") throw new ScimProtocolError(400, "displayName is required.", "mutability");
			if (typeof value !== "string") throw new ScimProtocolError(400, "displayName must be a string.", "invalidValue");
			return { kind: "attributes", values: { display_name: value } };
		case "externalid":
			if (op === "remove") return { kind: "attributes", values: { external_id: null } };
			if (typeof value !== "string") throw new ScimProtocolError(400, "externalId must be a string.", "invalidValue");
			return { kind: "attributes", values: { external_id: value } };
		case "members":
			if (op === "add") return { kind: "members-add", userIds: memberIds(value) };
			if (op === "replace") return { kind: "members-replace", userIds: memberIds(value) };
			// A remove without a value removes every member (RFC 7644 section 3.5.2.2).
			if (value === undefined) return { kind: "members-replace", userIds: [] };
			return { kind: "members-remove", userIds: memberIds(value) };
		default:
			throw new ScimProtocolError(400, `PATCH path ${label} is not supported for Groups.`, "invalidPath");
	}
}

export function parseGroupPatch(value: unknown): GroupPatchChange[] {
	const parsed = patchSchema.safeParse(value);
	if (!parsed.success) throw new ScimProtocolError(400, parsed.error.issues[0]?.message ?? "Invalid Group PATCH request.", "invalidSyntax");
	const changes: GroupPatchChange[] = [];
	for (const operation of parsed.data.Operations) {
		const path = operation.path;
		if (path) {
			const filtered = filteredMemberPath.exec(path);
			if (filtered) {
				if (operation.op !== "remove") throw new ScimProtocolError(400, "Filtered member paths only support remove.", "invalidPath");
				changes.push({ kind: "members-remove", userIds: [filtered[1]] });
				continue;
			}
			changes.push(attributeChange(operation.op, path, operation.value, path));
			continue;
		}
		// Without a path, the value holds the attributes to set (RFC 7644 section 3.5.2.1/3.5.2.3). Every
		// attribute it names is applied, in the same request, so a rename can't drop the member change.
		if (operation.op === "remove" || !operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) {
			throw new ScimProtocolError(400, "PATCH path <none> is not supported for Groups.", "invalidPath");
		}
		for (const [attribute, attributeValue] of Object.entries(operation.value)) {
			if (ECHOED_READ_ONLY.has(attribute.toLowerCase())) continue;
			changes.push(attributeChange(operation.op, attribute, attributeValue, attribute));
		}
	}
	return changes;
}
