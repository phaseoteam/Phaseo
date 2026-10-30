import { permanentRedirect } from "next/navigation";

export default function CollectionsRedirectPage() {
	permanentRedirect("/models");
}
