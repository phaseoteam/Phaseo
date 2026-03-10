import { permanentRedirect } from "next/navigation";

export const metadata = {
	title: "Management API Keys - Settings",
};

export default async function ProvisioningKeysAliasPage() {
	permanentRedirect("/settings/management-api-keys");
}

