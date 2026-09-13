import { z } from "zod";
import { SCIM_URNS } from "./constants";
import { ScimProtocolError } from "./errors";

const stringValue = z.string().trim().max(512);
const multiValue = z.object({ value: stringValue, type: stringValue.optional(), primary: z.boolean().optional() }).passthrough();

export const scimUserInputSchema = z.object({
	schemas: z.array(z.string()).max(4).optional(),
	id: stringValue.optional(),
	meta: z.object({}).passthrough().optional(),
	externalId: stringValue.optional(),
	userName: z.string().trim().min(1).max(320),
	displayName: stringValue.optional(),
	active: z.boolean().optional().default(true),
	// Some identity providers include write-only password and read-only groups
	// attributes in create/replace payloads. Server-managed id/meta fields may
	// also be echoed during replacement. Accept these for interoperability, but
	// deliberately do not persist any client-supplied values for them.
	password: z.string().max(1024).optional(),
	groups: z.array(z.object({ value: stringValue.optional(), display: stringValue.optional(), type: stringValue.optional() }).passthrough()).max(1000).optional(),
	name: z.object({ givenName: stringValue.optional(), familyName: stringValue.optional() }).passthrough().optional(),
	emails: z.array(multiValue).max(20).optional().default([]),
	phoneNumbers: z.array(multiValue).max(20).optional().default([]),
	addresses: z.array(z.record(z.string(), z.unknown())).max(20).optional().default([]),
	locale: stringValue.optional(),
	preferredLanguage: stringValue.optional(),
	timezone: stringValue.optional(),
	title: stringValue.optional(),
	userType: stringValue.optional(),
	[SCIM_URNS.enterpriseUser]: z.object({
		employeeNumber: stringValue.optional(), costCenter: stringValue.optional(), organization: stringValue.optional(),
		division: stringValue.optional(), department: stringValue.optional(),
		manager: z.object({ value: z.string().uuid().optional(), displayName: stringValue.optional() }).optional(),
	}).passthrough().optional(),
}).strict().superRefine((user, context) => {
	for (const [attribute, values] of [["emails", user.emails], ["phoneNumbers", user.phoneNumbers]] as const) {
		const types = values.map((item) => item.type?.toLowerCase()).filter(Boolean);
		if (new Set(types).size !== types.length) context.addIssue({ code: "custom", path: [attribute], message: `${attribute} type values must be unique.` });
		if (values.filter((item) => item.primary).length > 1) context.addIssue({ code: "custom", path: [attribute], message: `${attribute} can contain only one primary value.` });
	}
});

export type ScimUserInput = z.infer<typeof scimUserInputSchema>;

export type ScimUserRow = {
	id: string; external_id: string | null; user_name: string; active: boolean; display_name: string | null;
	given_name: string | null; family_name: string | null; employee_number: string | null; cost_center: string | null;
	organization: string | null; division: string | null; department: string | null; manager_scim_user_id: string | null;
	emails: unknown[]; phone_numbers: unknown[]; addresses: unknown[]; locale: string | null; preferred_language: string | null;
	timezone: string | null; title: string | null; user_type: string | null; version: number; created_at: string; updated_at: string;
};

export function parseScimUserInput(value: unknown): ScimUserInput {
	const result = scimUserInputSchema.safeParse(value);
	if (!result.success) throw new ScimProtocolError(400, result.error.issues[0]?.message ?? "Invalid User resource.", "invalidValue");
	return result.data;
}

export function userInputToRow(input: ScimUserInput) {
	const enterprise = input[SCIM_URNS.enterpriseUser];
	return {
		external_id: input.externalId ?? null, user_name: input.userName, active: input.active,
		display_name: input.displayName ?? null, given_name: input.name?.givenName ?? null, family_name: input.name?.familyName ?? null,
		employee_number: enterprise?.employeeNumber ?? null, cost_center: enterprise?.costCenter ?? null,
		organization: enterprise?.organization ?? null, division: enterprise?.division ?? null, department: enterprise?.department ?? null,
		manager_scim_user_id: enterprise?.manager?.value ?? null, emails: input.emails, phone_numbers: input.phoneNumbers,
		addresses: input.addresses, locale: input.locale ?? null, preferred_language: input.preferredLanguage ?? null,
		timezone: input.timezone ?? null, title: input.title ?? null, user_type: input.userType ?? null,
	};
}

export function toScimUser(row: ScimUserRow, baseUrl: string) {
	const enterprise = {
		employeeNumber: row.employee_number ?? undefined, costCenter: row.cost_center ?? undefined,
		organization: row.organization ?? undefined, division: row.division ?? undefined, department: row.department ?? undefined,
		manager: row.manager_scim_user_id ? { value: row.manager_scim_user_id, $ref: `${baseUrl}/Users/${row.manager_scim_user_id}` } : undefined,
	};
	return {
		schemas: [SCIM_URNS.user, SCIM_URNS.enterpriseUser], id: row.id, externalId: row.external_id ?? undefined,
		userName: row.user_name, displayName: row.display_name ?? undefined, active: row.active,
		name: { givenName: row.given_name ?? undefined, familyName: row.family_name ?? undefined },
		emails: row.emails, phoneNumbers: row.phone_numbers, addresses: row.addresses,
		locale: row.locale ?? undefined, preferredLanguage: row.preferred_language ?? undefined,
		timezone: row.timezone ?? undefined, title: row.title ?? undefined, userType: row.user_type ?? undefined,
		[SCIM_URNS.enterpriseUser]: enterprise,
		meta: { resourceType: "User", created: row.created_at, lastModified: row.updated_at, version: `W/\"${row.version}\"`, location: `${baseUrl}/Users/${row.id}` },
	};
}
