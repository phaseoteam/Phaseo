import { redirect } from "next/navigation";

export const metadata = {
	title: "Data Audit - Internal",
};

export default async function ModelsAuditPage() {
	redirect("/internal/data");
}
