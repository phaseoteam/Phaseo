import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ByokContent from "./ByokContent";
export const metadata = { title: "BYOK - Settings" };
export default async function Page() { return <ByokContent providerCatalogData={await fetchFrontendAPIProviders()} />; }
