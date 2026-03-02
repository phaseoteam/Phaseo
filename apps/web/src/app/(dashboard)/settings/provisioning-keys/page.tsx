import { permanentRedirect } from "next/navigation";

export const metadata = {
	title: "Provisioning Keys - Settings",
};

export default async function ProvisioningKeysPage() {
	permanentRedirect("/settings/management-api-keys");
}
