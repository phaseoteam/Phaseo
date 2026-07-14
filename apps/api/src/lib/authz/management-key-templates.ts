import { DEFAULT_MANAGEMENT_KEY_CAPABILITIES } from "./capabilities";

const CONTROL_READ_SCOPES = DEFAULT_MANAGEMENT_KEY_CAPABILITIES.filter((scope) =>
	scope.endsWith(":read"),
);
const CONTROL_READ_WRITE_SCOPES = DEFAULT_MANAGEMENT_KEY_CAPABILITIES.filter(
	(scope) => scope.endsWith(":read") || scope.endsWith(":write"),
);

export const MANAGEMENT_KEY_TEMPLATES = {
	"read-only": {
		title: "Read",
		description: "View all workspace control-plane resources without changing them.",
		scopes: CONTROL_READ_SCOPES,
	},
	"read-write": {
		title: "Write",
		description: "View and change resources, without destructive delete access.",
		scopes: CONTROL_READ_WRITE_SCOPES,
	},
	"full-control": {
		title: "All",
		description: "Manage all workspace control-plane resources.",
		scopes: DEFAULT_MANAGEMENT_KEY_CAPABILITIES,
	},
} as const;

export type ManagementKeyTemplate = keyof typeof MANAGEMENT_KEY_TEMPLATES;

export function isManagementKeyTemplate(value: unknown): value is ManagementKeyTemplate {
	return typeof value === "string" && value in MANAGEMENT_KEY_TEMPLATES;
}
