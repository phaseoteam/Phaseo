import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { createOrganisationAction } from "../../actions";

export default function NewOrganisationPage() {
  return <div className="container mx-auto space-y-8 py-8"><h1 className="text-2xl font-semibold">Create organisation</h1><OrganisationForm action={createOrganisationAction} /></div>;
}
